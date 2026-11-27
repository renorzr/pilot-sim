#!/usr/bin/env python3
"""Build JFK source geography and curated departure. Build dependencies: Pillow, osmium, Shapely. Runtime is fully offline."""
import argparse,concurrent.futures,csv,datetime,hashlib,heapq,collections,io,json,math,pathlib,urllib.request
from PIL import Image
import osmium
ROOT=pathlib.Path(__file__).resolve().parents[1]
OSM_URL='https://download.geofabrik.de/north-america/us/new-york/new-york-261120.osm.pbf'
AIRPORT_URL='https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/'
DEM_URL='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
OSM_BOUNDS=DEM_BOUNDS=[40.25,-74.18,40.99,-73.40]
AIRPORT_BOUNDS=[40.59,-73.85,40.68,-73.72]

def download(url, path):
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url, headers={"User-Agent": "pilot-sim-geography-builder/1.0"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    temporary = path.with_name(path.name + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)
    return data

def contains(point, bounds):
    lon, lat = point
    south, west, north, east = bounds
    return south <= lat <= north and west <= lon <= east

def simplify(points, epsilon=0.000035):
    """RDP in local equirectangular coordinates, approximately 3-4 metres."""
    if len(points) < 4:
        return points
    # Ring endpoints must not collapse onto each other.
    if points[0] == points[-1]:
        split = len(points) // 2
        return simplify(points[: split + 1], epsilon)[:-1] + simplify(
            points[split:] + [points[0]], epsilon
        )
    ax, ay = points[0][0] * 0.759, points[0][1]
    bx, by = points[-1][0] * 0.759, points[-1][1]
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    best, index = 0, 0
    for i, point in enumerate(points[1:-1], 1):
        px, py = point[0] * 0.759, point[1]
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom)) if denom else 0
        distance = math.hypot(px - ax - t * dx, py - ay - t * dy)
        if distance > best:
            best, index = distance, i
    if best <= epsilon:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], epsilon)[:-1] + simplify(
        points[index:], epsilon
    )

def sea_polygons(osm):
    """Bounded water derivative: OSM coastlines have land left, sea right.

    Polygonization uses only real shoreline geometry plus the selection rectangle.
    It preserves island holes and does not invent a hand-drawn airport coast.
    """
    from shapely.geometry import LineString, Point, box
    from shapely.ops import polygonize, unary_union
    south, west, north, east = osm["bounds"]
    clip = box(west, south, east, north)
    coasts = [f for f in osm["features"] if f["tags"].get("natural") == "coastline"]
    lines = []
    sea_samples = []
    for f in coasts:
        ps = f["geometry"]
        line = LineString(ps).intersection(clip)
        if not line.is_empty:
            lines.append(line)
        for a, b in zip(ps, ps[1:]):
            dx, dy = b[0]-a[0], b[1]-a[1]
            length = math.hypot(dx, dy)
            if length < 0.000001:
                continue
            # About one metre offshore, on the right of the oriented OSM way.
            sea_samples.append(Point((a[0]+b[0])/2 + dy/length*0.00001,
                                     (a[1]+b[1])/2 - dx/length*0.00001))
    polygons = list(polygonize(unary_union([clip.boundary] + lines)))
    # Dangling harbour/piers can put a tiny right-side sample inside a land
    # face. Classify whole faces by length-weighted coastline side votes rather
    # than treating one offshore sample as proof of an entire face being water.
    import numpy as np
    import shapely
    points=[[],[]];weights=[]
    for f in coasts:
        for a,b in zip(f['geometry'],f['geometry'][1:]):
            dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
            if length<.000001:continue
            weights.append(length)
            for side,sign in [(0,1),(1,-1)]:points[side].append([(a[0]+b[0])/2+sign*dy/length*.00001,(a[1]+b[1])/2-sign*dx/length*.00001])
    ps=np.asarray(points);weights=np.asarray(weights);water=[]
    for poly in polygons:
        scores=[float(weights[shapely.contains_xy(poly,ps[k,:,0],ps[k,:,1])].sum()) for k in [0,1]]
        if scores[0]>scores[1]:water.append(poly)
    # Joining adjacent marine faces avoids seams at touching source ways.
    merged = unary_union(water)
    if merged.is_empty:
        raise ValueError("No sea polygons assembled from the source coastline")
    polygons = [merged] if merged.geom_type == "Polygon" else list(merged.geoms)
    result = []
    for i, poly in enumerate(polygons):
        feature = {"id": f"derived/sea/{i}",
                   "tags": {"natural": "water", "water": "sea", "name": "Jamaica Bay / Atlantic Ocean"},
                   "geometry": [[round(x,7), round(y,7)] for x,y in poly.exterior.coords],
                   "holes": [[[round(x,7),round(y,7)] for x,y in ring.coords] for ring in poly.interiors],
                   "sourceFeatureIds": [f["id"] for f in coasts if LineString(f["geometry"]).intersects(poly.boundary)],
                   "derivation": "Polygonized oriented OSM coastlines clipped by the scenery selection bounds; sea is right of source way direction. Rectangle edges are display clipping boundaries."}
        result.append(feature)
    osm["seaDerivation"] = {"method": "OSM coastline polygonization with island holes, bounded display clipping and length-weighted side classification", "sourceCoastlineCount": len(coasts), "polygonCount": len(result), "license": "ODbL-1.0"}
    osm["features"].extend(result)

def clip_scenery(osm):
    """Clip selected source geometry to the actual DEM/display rectangle."""
    from shapely.geometry import LineString, Polygon, Point, box
    south, west, north, east = osm["bounds"]
    extent = box(west, south, east, north)
    result = []
    for f in osm["features"]:
        ps = f["geometry"]
        if all(contains(p, osm["bounds"]) for p in ps):
            result.append(f)
            continue
        polygon = len(ps) >= 4 and ps[0] == ps[-1]
        geom = Polygon(ps, f.get("holes", [])) if polygon else LineString(ps) if len(ps) > 1 else Point(ps[0])
        if not geom.is_valid:
            geom = geom.buffer(0) if polygon else geom
        clipped = geom.intersection(extent)
        parts = list(clipped.geoms) if hasattr(clipped, "geoms") else [clipped]
        j = 0
        for part in parts:
            if part.is_empty or part.geom_type not in {"Polygon", "LineString", "Point"}:
                continue
            out = dict(f)
            out["id"] = f["id"] + (f"/clip{j}" if j else "")
            out["sourceId"] = f["id"]
            out["geometryClipping"] = "Clipped to the DEM/scenery bounds; source object identity retained."
            if part.geom_type == "Polygon":
                out["geometry"] = [[round(x,7),round(y,7)] for x,y in part.exterior.coords]
                out["holes"] = [[[round(x,7),round(y,7)] for x,y in r.coords] for r in part.interiors]
            else:
                out["geometry"] = [[round(x,7),round(y,7)] for x,y in part.coords]
                out.pop("holes", None)
            result.append(out)
            j += 1
    osm["features"] = result
    osm["geometryClipping"] = "Every feature is clipped to the DEM/scenery selection rectangle; coast-derived sea retains island holes."

def terrain_data(cache):
    bounds, columns, rows, zoom = DEM_BOUNDS, 129, 129, 10
    south, west, north, east = bounds

    def pixels(lon, lat):
        scale = 2**zoom * 256
        r = math.radians(lat)
        return (lon + 180) / 360 * scale, (
            1 - math.asinh(math.tan(r)) / math.pi
        ) / 2 * scale

    left, top = pixels(west, north)
    right, bottom = pixels(east, south)
    keys = [
        (x, y)
        for y in range(int(top // 256), int(bottom // 256) + 1)
        for x in range(int(left // 256), int(right // 256) + 1)
    ]

    def tile(key):
        x, y = key
        data = download(
            DEM_URL.format(z=zoom, x=x, y=y),
            cache / "terrarium" / str(zoom) / str(x) / (str(y) + ".png"),
        )
        return key, Image.open(io.BytesIO(data)).convert("RGB")

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tiles = dict(pool.map(tile, keys))

    def at(px, py):
        x, y = int(px), int(py)
        red, green, blue = tiles[(x // 256, y // 256)].getpixel((x % 256, y % 256))
        return red * 256 + green + blue / 256 - 32768

    heights = []
    for j in range(rows):
        lat = south + (north - south) * j / (rows - 1)
        for i in range(columns):
            lon = west + (east - west) * i / (columns - 1)
            px, py = pixels(lon, lat)
            u, v = px % 1, py % 1
            a, b, c, d = (
                at(px, py),
                at(math.floor(px) + 1, py),
                at(px, math.floor(py) + 1),
                at(math.floor(px) + 1, math.floor(py) + 1),
            )
            heights.append(
                round((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v, 1)
            )
    return {
        "bounds": bounds,
        "columns": columns,
        "rows": rows,
        "heights": heights,
        "units": "m",
        "rowOrder": "south-to-north",
        "columnOrder": "west-to-east",
        "verticalDatum": "source terrain elevations; approximate MSL, not survey-grade",
        "source": "https://registry.opendata.aws/terrain-tiles/",
        "sourceZoom": zoom,
        "encoding": "Terrarium: R*256 + G + B/256 - 32768",
        "attribution": "Terrain data courtesy of the U.S. Geological Survey; Mapzen/Tilezen terrain tiles",
        "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
    }

def airport_data(cache):
    aps=list(csv.DictReader(io.StringIO(download(AIRPORT_URL+'airports.csv',cache/'airports.csv').decode('utf-8-sig'))))
    rs=list(csv.DictReader(io.StringIO(download(AIRPORT_URL+'runways.csv',cache/'runways.csv').decode('utf-8-sig'))))
    a=next(r for r in aps if r['ident']=='KJFK')
    airport={'ident':'KJFK','iata':'JFK','name':a['name'],'latitude':float(a['latitude_deg']),'longitude':float(a['longitude_deg']),'elevationM':round(float(a['elevation_ft'])*.3048,3)}
    runways=[]
    for r in rs:
        if r['airport_ident']!='KJFK' or r['closed']=='1':continue
        ends=[{'id':r[k+'_ident'],'latitude':float(r[k+'_latitude_deg']),'longitude':float(r[k+'_longitude_deg']),'elevationM':round(float(r[k+'_elevation_ft'] or a['elevation_ft'])*.3048,3),'trueHeadingDeg':float(r[k+'_heading_degT']),'displacedThresholdM':round(float(r[k+'_displaced_threshold_ft'] or 0)*.3048,3)} for k in ['le','he']]
        runways.append({'id':'/'.join(e['id'] for e in ends),'lengthM':round(float(r['length_ft'])*.3048,3),'widthM':round(float(r['width_ft'])*.3048,3),'surface':r['surface'],'lighted':r['lighted']=='1','ends':ends})
    return airport,runways

def osm_data(path):
    allowed={'aeroway','building','building:levels','height','min_height','name','name:en','ref','highway','waterway','water','natural','landuse','surface','width','man_made','historic','construction','proposed','tourism'}
    features=[]
    class Handler(osmium.SimpleHandler):
        def node(self,n):
            t=dict(n.tags)
            if t.get('aeroway') not in {'gate','parking_position','holding_position','control_tower'} and t.get('man_made')!='tower':return
            p=[round(n.location.lon,7),round(n.location.lat,7)]
            if contains(p,AIRPORT_BOUNDS):features.append({'id':'node/'+str(n.id),'tags':{k:v for k,v in t.items() if k in allowed},'geometry':[p]})
        def way(self,w):
            t=dict(w.tags)
            airport='aeroway' in t
            coast=t.get('natural')=='coastline'
            road=t.get('highway') in {'motorway','motorway_link','trunk','trunk_link','primary','primary_link'}
            water=t.get('natural')=='water' or t.get('waterway') in {'river','canal'}
            land=t.get('landuse') in {'forest','industrial','grass','residential'} or t.get('natural') in {'wood','scrub'}
            building='building' in t or t.get('man_made')=='tower'
            if not(airport or coast or road or water or land or building):return
            if building and not airport:
                try:
                    first=w.nodes[0]
                    if not contains([first.lon,first.lat],AIRPORT_BOUNDS):return
                except (osmium.InvalidLocationError,IndexError):return
            try:ps=[[round(n.lon,7),round(n.lat,7)] for n in w.nodes]
            except osmium.InvalidLocationError:return
            if len(ps)<2 or not any(contains(p,OSM_BOUNDS) for p in ps):return
            near=any(contains(p,AIRPORT_BOUNDS) for p in ps)
            if (airport or building) and not near:return
            if (road or land) and not any(contains(p,[40.53,-73.98,40.76,-73.62]) for p in ps):return
            if water and len(ps)>3 and ps[0]==ps[-1] and abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ps,ps[1:]))/2)<.000003:return
            ps=simplify(ps,0.000002 if airport or building or coast else .00006)
            features.append({'id':'way/'+str(w.id),'tags':{k:v for k,v in t.items() if k in allowed},'geometry':ps})
    processor=osmium.FileProcessor(str(path)).with_locations('flex_mem').with_filter(osmium.filter.KeyFilter('aeroway','building','highway','landuse','natural','waterway','man_made')).with_filter(Handler())
    for _ in processor:pass
    return {'bounds':OSM_BOUNDS,'airportBounds':AIRPORT_BOUNDS,'coordinates':'WGS84 longitude, latitude','source':OSM_URL,'license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','attribution':'© OpenStreetMap contributors','features':features}



def patch_coastline(osm,cache):
    """Complete source shorelines that cross the regional NY/NJ boundary.

    Only exact connected OSM coastline ways are followed; no straight-line shore
    closure is invented. Each bounded API object is cached with a provenance hash.
    """
    import xml.etree.ElementTree as ET
    coasts=[f for f in osm['features'] if f['tags'].get('natural')=='coastline'];known={f['id'] for f in coasts};ends=collections.Counter(tuple(p) for f in coasts for p in [f['geometry'][0],f['geometry'][-1]])
    south,west,north,east=osm['bounds']
    interior=lambda p:west+1e-7<p[0]<east-1e-7 and south+1e-7<p[1]<north-1e-7
    loose=[(f,p) for f in coasts for p in [f['geometry'][0],f['geometry'][-1]] if ends[tuple(p)]==1 and interior(p)]
    records=[];added=[];queue=collections.deque(loose);seen=set()
    def api(path):
        name=path.replace('/','-')+'.osm';url='https://api.openstreetmap.org/api/0.6/'+path;data=download(url,cache/'coast-api'/name);records.append({'url':url,'filename':'coast-api/'+name,'sha256':hashlib.sha256(data).hexdigest()});return ET.fromstring(data)
    def way_full(ident):
        tree=api('way/'+ident+'/full');nodes={n.attrib['id']:[round(float(n.attrib['lon']),7),round(float(n.attrib['lat']),7)] for n in tree.findall('node')};way=next(w for w in tree.findall('way') if w.attrib['id']==ident);ids=[n.attrib['ref'] for n in way.findall('nd')];tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')};return way,ids,[nodes[i] for i in ids],tags
    while queue:
        f,p=queue.popleft();key=(f['id'],tuple(p))
        if key in seen:continue
        seen.add(key)
        assert len(seen)<100,'Unexpectedly extensive coast supplement'
        w,ids,ps,tags=way_full(f['id'].split('/')[1]);which=min([0,len(ps)-1],key=lambda i:math.hypot(ps[i][0]-p[0],ps[i][1]-p[1]));assert math.hypot(ps[which][0]-p[0],ps[which][1]-p[1])<.00003,(f['id'],p,ps[which]);nodeid=ids[which]
        for neighbor in api('node/'+nodeid+'/ways').findall('way'):
            t={x.attrib['k']:x.attrib['v'] for x in neighbor.findall('tag')};ident=neighbor.attrib['id'];fid='way/'+ident
            if t.get('natural')!='coastline' or fid in known:continue
            way,nids,points,nt=way_full(ident);known.add(fid);out={'id':fid,'tags':nt,'geometry':points,'source':'https://api.openstreetmap.org/api/0.6/way/'+ident+'/full','sourceTimestamp':way.attrib.get('timestamp'),'sourceVersion':way.attrib.get('version'),'derivation':'Exact connected coastline supplement at the New York regional extract boundary.'};added.append(out);osm['features'].append(out);print('coast supplement',fid,len(points),flush=True)
            for q in [points[0],points[-1]]:
                if q!=ps[which] and interior(q) and ends.get(tuple(q),0)==0:queue.append((out,q))
    osm['coastlineSupplement']={'method':'Exact connected OSM coastline ways across regional NY/NJ boundary; bounded source API lookup, no invented shore segments.','featureIds':[f['id'] for f in added],'snapshots':list({r['url']:r for r in records}.values()),'license':'ODbL-1.0'}

def add_terminal7(osm,cache):
    import xml.etree.ElementTree as ET
    url='https://api.openstreetmap.org/api/0.6/relation/3778808/full'
    data=download(url,cache/'terminal7-api.osm');tree=ET.fromstring(data)
    nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in tree.findall('node')}
    ways={w.attrib['id']:[nodes[n.attrib['ref']] for n in w.findall('nd')] for w in tree.findall('way')}
    r=next(r for r in tree.findall('relation') if r.attrib['id']=='3778808');tags={t.attrib['k']:t.attrib['v'] for t in r.findall('tag')}
    outer=[ways[m.attrib['ref']] for m in r.findall('member') if m.attrib.get('role')=='outer' and m.attrib['type']=='way'];holes=[ways[m.attrib['ref']] for m in r.findall('member') if m.attrib.get('role')=='inner' and m.attrib['type']=='way']
    assert len(outer)==1 and outer[0][0]==outer[0][-1]
    f={'id':'relation/3778808','tags':tags,'geometry':outer[0],'holes':holes,'source':url,'sourceTimestamp':r.attrib.get('timestamp'),'sourceVersion':r.attrib.get('version')};osm['features'].append(f)
    osm['supplementalSources']=[{'name':'OpenStreetMap API terminal relation','url':url,'sha256':hashlib.sha256(data).hexdigest(),'license':'ODbL-1.0','note':'Exact bounded source relation3778808/full supplies untagged terminal7 outer/inner members omitted by the tagged-way regional selection.'}]

def compact_scenery(osm):
    from shapely.geometry import Polygon,Point
    boundary=next(f for f in osm['features'] if f['id']=='way/158042008')
    footprint=Polygon(boundary['geometry']);kept=[]
    for f in osm['features']:
        t,ps=f['tags'],f['geometry'];near=any(contains(p,[40.58,-73.89,40.70,-73.70]) for p in ps)
        airport='aeroway' in t and any(contains(p,AIRPORT_BOUNDS) for p in ps)
        building='building' in t and any(footprint.covers(Point(p)) for p in ps)
        tower=t.get('man_made')=='tower' and any(contains(p,AIRPORT_BOUNDS) for p in ps)
        water=t.get('natural')=='coastline' or t.get('natural')=='water' or t.get('waterway') in {'river','canal'}
        road=near and t.get('highway') in {'motorway','motorway_link','trunk','trunk_link','primary','primary_link'}
        land=near and (t.get('landuse') in {'industrial','forest','grass'} or t.get('natural') in {'wood','scrub'})
        if airport or building or tower or water or road or land:kept.append(f)
    osm['features']=kept
    osm['scenerySelection']={'airportBuildingBoundary':boundary['id'],'nearbyDetailBounds':[40.58,-73.89,40.70,-73.70],'note':'Airport aeroways and buildings; nearby principal roads and larger land/water features. No urban house extrusion.'}

def departure_data(pack, airport_id='jfk', active_runway='22R', side=1, entry_min_ratio=2):
    fs=pack['osm']['features'];runway=next(r for r in pack['runways'] if any(e['id']==active_runway for e in r['ends']));a=next(e for e in runway['ends'] if e['id']==active_runway);b=next(e for e in runway['ends'] if e['id']!=active_runway);rad=math.pi/180;lx=6378137*rad*math.cos(a['latitude']*rad);lz=6378137*rad;E=(b['longitude']-a['longitude'])*lx;N=(b['latitude']-a['latitude'])*lz;heading=math.atan2(E,N);c=math.cos(heading);s=math.sin(heading)
    def proj(p):
        e=(p[0]-a['longitude'])*lx;n=(p[1]-a['latitude'])*lz;return(side*(e*c-n*s),-e*s-n*c)
    def inv(p):
        x,z=p;x*=side;return(a['longitude']+(x*c-z*s)/lx,a['latitude']+(-x*s-z*c)/lz)
    def dist(p,q):return math.hypot(p[0]-q[0],p[1]-q[1])
    def along(p,a,b):
        d=(b[0]-a[0],b[1]-a[1]);u=max(0,min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/max(1e-9,d[0]**2+d[1]**2)));q=(a[0]+d[0]*u,a[1]+d[1]*u);return dist(p,q),u,q
    taxiways=[f for f in fs if f['tags'].get('aeroway')=='taxiway'];segments=[]
    for f in taxiways:
        ps=list(map(proj,f['geometry']))
        for A,B in zip(ps,ps[1:]):
            if dist(A,B)>.1 and max(A[0],B[0])>95 and max(A[1],B[1])>-3000 and min(A[1],B[1])<1500:segments.append({'a':A,'b':B,'f':f,'u':[0,1]})
    candidates=[]
    for S in segments:
        A,B=S['a'],S['b']
        if min(A[0],B[0])<110<max(A[0],B[0]) and abs(B[0]-A[0])>1:
            u=(110-A[0])/(B[0]-A[0]);q=(110,A[1]+(B[1]-A[1])*u)
            if -650<q[1]<-80 and abs(B[0]-A[0])>abs(B[1]-A[1])*entry_min_ratio:candidates.append((abs(q[1]+170),S,u,q))
    assert candidates,'No source runway-entry taxiway found'
    _,entrySeg,holdU,hold=min(candidates,key=lambda t:t[0]);entrySeg['u'].append(holdU)
    # Native source intersections normally share OSM nodes. Add exact geometric
    # intersections too, without bridging disconnected aprons or crossing runways.
    for i,A in enumerate(segments):
        ax,az=A['a'];dx,dz=A['b'][0]-ax,A['b'][1]-az
        for B in segments[i+1:]:
            if max(A['a'][0],A['b'][0])+1<min(B['a'][0],B['b'][0]) or max(B['a'][0],B['b'][0])+1<min(A['a'][0],A['b'][0]) or max(A['a'][1],A['b'][1])+1<min(B['a'][1],B['b'][1]) or max(B['a'][1],B['b'][1])+1<min(A['a'][1],A['b'][1]):continue
            bx,bz=B['a'];ex,ez=B['b'][0]-bx,B['b'][1]-bz;den=dx*ez-dz*ex
            if abs(den)>1e-8:
                u=((bx-ax)*ez-(bz-az)*ex)/den;v=((bx-ax)*dz-(bz-az)*dx)/den
                if 0<=u<=1 and 0<=v<=1:A['u'].append(u);B['u'].append(v)
    positions=[];buckets=collections.defaultdict(list)
    def node(p):
        ix,iz=math.floor(p[0]),math.floor(p[1])
        for x in range(ix-1,ix+2):
            for z in range(iz-1,iz+2):
                for i in buckets[x,z]:
                    if dist(p,positions[i])<.9:return i
        i=len(positions);positions.append(p);buckets[ix,iz].append(i);return i
    # Insert real parking lead-in apron endpoints into their source taxiway.
    stands=[]
    for f in fs:
        if f['tags'].get('aeroway')!='parking_position' or not f['tags'].get('ref') or len(f['geometry'])<2:continue
        ps=list(map(proj,f['geometry']))
        if not all(95<p[0]<1800 and -2400<p[1]<300 for p in ps):continue
        endpoints=[]
        for reverse in [False,True]:
            path=list(reversed(ps)) if reverse else ps;start=path[0];match=min(((along(start,S['a'],S['b']),S) for S in segments),key=lambda t:t[0][0]);endpoints.append((match[0][0],path,match))
        d,path,((_,u,q),S)=min(endpoints,key=lambda t:t[0])
        if d>2:continue
        S['u'].append(u);stands.append((f,path,q))
    adj=collections.defaultdict(list)
    for S in segments:
        us=sorted(set(round(u,9) for u in S['u']));ps=[(S['a'][0]+(S['b'][0]-S['a'][0])*u,S['a'][1]+(S['b'][1]-S['a'][1])*u) for u in us]
        for A,B in zip(ps,ps[1:]):
            if min(A[0],B[0])<95:continue
            i,j=node(A),node(B)
            if i!=j:adj[i].append((j,dist(A,B),S['f']));adj[j].append((i,dist(A,B),S['f']))
    goal=node(hold);heap=[(0,goal)];best={goal:0};prev={}
    while heap:
        d,i=heapq.heappop(heap)
        if d>best[i]:continue
        for j,w,f in adj[i]:
            nd=d+w
            if nd<best.get(j,float('inf')):best[j]=nd;prev[j]=(i,f);heapq.heappush(heap,(nd,j))
    viable=[]
    for f,ps,start in stands:
        n=node(start)
        if n in best and 120<best[n]<3000:viable.append((best[n],f,ps,start,n))
    assert viable,('No connected stand',len(stands),len(best))
    total,standway,standps,start,n=min(viable,key=lambda t:t[0]);ref=standway['tags']['ref'];nose=standps[-1];before=standps[-2];dx,dz=(nose[0]-before[0])/dist(nose,before),(nose[1]-before[1])/dist(nose,before);standYaw=math.atan2(dx,-dz);cg=(nose[0]-dx*15,nose[1]-dz*15)
    def point(p,source,name,kind='source-network-point'):return{'x':round(p[0],3),'z':round(p[1],3),'sourceId':source,'name':name,'kind':kind}
    route=[point(start,standway['id'],ref)]
    while n!=goal:
        j,f=prev[n];route.append(point(positions[j],f['id'],f['tags'].get('ref') or 'TAXI'));n=j
    route[-1].update(name=active_runway+' HOLD',kind='game-holding-point');entrySource=entrySeg['f'];z=hold[1];arcStart=(50,z);center=(50,z-50);entry=[point(hold,entrySource['id'],active_runway+' HOLD','game-holding-point'),point(arcStart,entrySource['id'],entrySource['tags'].get('ref') or 'ENTRY','source-entry-alignment')]
    for i in range(1,9):
        t=i*math.pi/16;entry.append(point((50-50*math.sin(t),z-50+50*math.cos(t)),'OurAirports:'+'/'.join(e['id'] for e in runway['ends']),active_runway,'game-lineup-arc'))
    lineupZ=z-100;entry.append(point((0,lineupZ),'OurAirports:'+'/'.join(e['id'] for e in runway['ends']),active_runway,'runway-centerline'));holdYaw=math.atan2(entry[1]['x']-hold[0],-(entry[1]['z']-hold[1]));startYaw=math.atan2(route[1]['x']-route[0]['x'],-(route[1]['z']-route[0]['z']))
    length=lambda points:sum(math.hypot(b['x']-a['x'],b['z']-a['z']) for a,b in zip(points,points[1:]));lon,lat=inv(nose)
    result={'schemaVersion':1,'airportId':airport_id,'runwayId':active_runway,'coordinateFrame':f'Metres in active{active_runway} tangent frame: x runway-right, z approach side, y above threshold; yaw0 follows runway forward(-z).','stand':{'ref':ref,'sourceId':standway['id'],'longitude':lon,'latitude':lat,'x':round(cg[0],3),'z':round(cg[1],3),'yaw':standYaw,'nose':{'x':round(nose[0],3),'z':round(nose[1],3)},'cgSetbackM':15,'note':'Actual OSM parking lead-in nose endpoint; gameCG sits15m back along source lead-in.'},'handoff':{'x':round(start[0],3),'z':round(start[1],3),'yaw':startYaw,'sourceId':standway['id'],'note':'Automatic crew departure abstracts pushback; handoff is the actual source stand lead-in/taxiway connection.'},'taxiPoints':route,'hold':{'x':round(hold[0],3),'z':round(hold[1],3),'yaw':holdYaw,'sourceId':entrySource['id'],'isPublishedHoldingPosition':False,'note':'GameCG holding point on source entrytaxiway, outside protectedstrip with15m noseclearance.'},'entryPoints':entry,'lineup':{'x':0,'z':round(lineupZ,3),'yaw':0,'sourceId':'OurAirports:'+'/'.join(e['id'] for e in runway['ends']),'remainingRunwayM':round(math.hypot(E,N)+lineupZ,3)},'taxiDistanceM':round(length(route),3),'entryDistanceM':round(length(entry),3),'routeReferences':list(dict.fromkeys([ref]+[p['name'] for p in route[1:-1]]+[active_runway])),'sourceFeatureIds':list(dict.fromkeys([standway['id']]+[p['sourceId'] for p in route[1:]])),'sources':[{'name':'OpenStreetMap contributors','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','dataFile':airport_id+'.json'},{'name':'OurAirports','license':'Unlicense / public domain','dataFile':airport_id+'.json'}],'notes':['Curated game departure follows real source stand and connected taxiway vertices; this is not a published current taxi clearance.','Source taxi/OurAirports centerline mismatch is bridged by a clearly synthetic50m radiusalignmentarc and50mstraightsegment before the finalstop.','The holdingCG is110m from the activeaxis; entry and takeoff require separate clearances. Optionaltaxiskipnevergrantsrunwayentry.']}

    def restore(value):
        if isinstance(value,list):return [restore(v) for v in value]
        if not isinstance(value,dict):return value
        return {k:(v*side if k in {'x','yaw'} and isinstance(v,(int,float)) else restore(v)) for k,v in value.items()}
    return restore(result)


def validate_data(pack,departure=None):
    from shapely.geometry import Polygon,Point
    def finite(v):
        if isinstance(v,dict):return all(finite(x) for x in v.values())
        if isinstance(v,list):return all(finite(x) for x in v)
        return not isinstance(v,(int,float)) or math.isfinite(v)
    assert finite(pack),'Non-finite source value'
    fs=pack['osm']['features'];ids={f['id'] for f in fs};assert len(ids)==len(fs),'Duplicate source identity'
    assert pack['dem']['columns']==pack['dem']['rows']==129 and len(pack['dem']['heights'])==129*129
    water=[Polygon(f['geometry'],f.get('holes',[])) for f in fs if f['tags'].get('water')=='sea'];assert water and all(p.is_valid for p in water)
    for lon,lat,expected in [(-73.7781,40.6413,False),(-73.841,40.615,True),(-73.70,40.70,False),(-73.75,40.50,True),(-73.9857,40.7484,False),(-74.08,40.70,False),(-73.820,40.604,False)]:assert any(p.covers(Point(lon,lat)) for p in water)==expected,(lon,lat,expected)
    if departure:
        assert finite(departure) and departure['runwayId']=='22R' and departure['stand']['ref']=='9'
        assert all(i in ids for i in departure['sourceFeatureIds'])
        assert departure['hold']['x']>=110 and departure['lineup']['x']==0
        assert departure['taxiDistanceM']<3000 and departure['entryDistanceM']>150
        st=departure['stand'];assert abs(math.hypot(st['x']-st['nose']['x'],st['z']-st['nose']['z'])-15)<.002

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('/tmp/pilot-sim-jfk-data'));p.add_argument('--departure-only',action='store_true');p.add_argument('--geography-only',action='store_true');p.add_argument('--cached-osm',action='store_true',help='Reuse the cached regional tagged-way extraction');p.add_argument('--output',type=pathlib.Path,default=ROOT/'game/src/airports/data/jfk.json');a=p.parse_args();cache=a.cache
    if a.departure_only:
        pack=json.loads(a.output.read_text());departure=departure_data(pack);validate_data(pack,departure);a.output.with_name('jfk-departure.json').write_text(json.dumps(departure,ensure_ascii=False,indent=2)+'\n');return
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        ap=pool.submit(airport_data,cache);dem=pool.submit(terrain_data,cache)
        pf=cache/'new-york-261120.osm.pbf'
        if not pf.exists():download(OSM_URL,pf)
        osm=json.loads((cache/'jfk-osm-raw.json').read_text()) if a.cached_osm else osm_data(pf);print('OSM features',len(osm['features']),flush=True)
        (cache/'jfk-osm-raw.json').write_text(json.dumps(osm,separators=(',',':')))
        compact_scenery(osm);add_terminal7(osm,cache);patch_coastline(osm,cache);sea_polygons(osm);clip_scenery(osm);airport,runways=ap.result();terrain=dem.result()
    pack={'schemaVersion':1,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'airport':airport,'runways':runways,'osm':osm,'dem':terrain,'sources':[{'name':'OurAirports','url':'https://github.com/davidmegginson/ourairports-data','license':'Unlicense / public domain','snapshots':[{'filename':n,'sha256':hashlib.sha256((cache/n).read_bytes()).hexdigest()} for n in ['airports.csv','runways.csv']]},{'name':'OpenStreetMap contributors / Geofabrik','url':OSM_URL,'license':'ODbL-1.0','sha256':hashlib.sha256(pf.read_bytes()).hexdigest()},{'name':'Mapzen Terrain Tiles / USGS','url':'https://registry.opendata.aws/terrain-tiles/','licenseUrl':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','snapshots':[{'filename':str(p.relative_to(cache)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((cache/'terrarium').rglob('*.png'))]}]}
    validate_data(pack)
    a.output.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n');print('Wrote',a.output,a.output.stat().st_size,flush=True)
    if not a.geography_only:a.output.with_name('jfk-departure.json').write_text(json.dumps(departure_data(pack),ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
