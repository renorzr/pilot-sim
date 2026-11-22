#!/usr/bin/env python3
"""Build the local LAX geography pack from public source data.

Requires Python 3, Pillow, osmium and Shapely (build-time only). No online APIs are
called by the game. Download caches live outside the checkout by default.
"""

import argparse
import concurrent.futures
import csv
import datetime
import hashlib
import heapq
import collections
import io
import json
import math
import pathlib
import urllib.request

from PIL import Image
import osmium

ROOT = pathlib.Path(__file__).resolve().parents[1]
OSM_URL = "https://download.bbbike.org/osm/bbbike/LosAngeles/LosAngeles.osm.pbf"
AIRPORT_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OSM_BOUNDS = [33.58, -118.85, 34.31, -117.98]
DEM_BOUNDS = [33.58, -118.85, 34.31, -117.98]


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


def airport_data(cache):
    def csv_rows(name):
        data = download(AIRPORT_URL + name, cache / name)
        return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        airports, runways = pool.map(csv_rows, ["airports.csv", "runways.csv"])
    a = next(row for row in airports if row["ident"] == "KLAX")
    airport = {
        "ident": "KLAX",
        "iata": "LAX",
        "name": a["name"],
        "latitude": float(a["latitude_deg"]),
        "longitude": float(a["longitude_deg"]),
        "elevationM": round(float(a["elevation_ft"]) * 0.3048, 3),
    }
    strips = []
    for row in runways:
        if row["airport_ident"] != "KLAX" or row["closed"] == "1":
            continue
        ends = []
        for prefix in ["le", "he"]:
            ends.append(
                {
                    "id": row[prefix + "_ident"],
                    "latitude": float(row[prefix + "_latitude_deg"]),
                    "longitude": float(row[prefix + "_longitude_deg"]),
                    "elevationM": round(
                        float(row[prefix + "_elevation_ft"]) * 0.3048, 3
                    ),
                    "trueHeadingDeg": float(row[prefix + "_heading_degT"]),
                    "displacedThresholdM": round(
                        float(row[prefix + "_displaced_threshold_ft"] or 0) * 0.3048, 3
                    ),
                }
            )
        strips.append(
            {
                "id": "/".join(end["id"] for end in ends),
                "lengthM": round(float(row["length_ft"]) * 0.3048, 3),
                "widthM": round(float(row["width_ft"]) * 0.3048, 3),
                "surface": row["surface"],
                "lighted": row["lighted"] == "1",
                "ends": ends,
            }
        )
    return airport, strips


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
    ax, ay = points[0][0] * 0.830, points[0][1]
    bx, by = points[-1][0] * 0.830, points[-1][1]
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    best, index = 0, 0
    for i, point in enumerate(points[1:-1], 1):
        px, py = point[0] * 0.830, point[1]
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom)) if denom else 0
        distance = math.hypot(px - ax - t * dx, py - ay - t * dy)
        if distance > best:
            best, index = distance, i
    if best <= epsilon:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], epsilon)[:-1] + simplify(
        points[index:], epsilon
    )


def osm_data(path):
    allowed = {
        "aeroway",
        "building",
        "building:levels",
        "height",
        "min_height",
        "name",
        "name:en",
        "ref",
        "highway",
        "waterway",
        "water",
        "natural",
        "landuse",
        "surface",
        "width",
        "man_made",
        "service",
        "shop",
        "tourism",
    }
    airport_bounds = [33.922, -118.452, 33.964, -118.36]
    features = []

    class Handler(osmium.SimpleHandler):
        def area(self, area):
            if area.from_way():
                return
            tags = dict(area.tags)
            airport = "aeroway" in tags
            water = tags.get("natural") == "water"
            land = tags.get("landuse") in {
                "residential",
                "industrial",
                "commercial",
                "forest",
                "farmland",
                "orchard",
            } or tags.get("natural") in {"wood", "scrub"}
            # Airport/water/land multipolygons are assembled here. Ordinary
            # building detail uses source ways to avoid duplicate hotel/fire
            # structures over the terminal roofs in this curated snapshot.
            if not (airport or water or land):
                return
            for index, ring in enumerate(area.outer_rings()):
                points = [[round(n.lon, 7), round(n.lat, 7)] for n in ring]
                if len(points) < 4 or not any(contains(p, OSM_BOUNDS) for p in points):
                    continue
                holes = [
                    [[round(n.lon, 7), round(n.lat, 7)] for n in inner]
                    for inner in area.inner_rings(ring)
                ]
                feature = {
                    "id": "relation/"
                    + str(area.orig_id())
                    + ("/" + str(index) if index else ""),
                    "tags": {k: v for k, v in tags.items() if k in allowed},
                    "geometry": simplify(points, 0.00002 if airport else 0.00009),
                }
                if holes:
                    feature["holes"] = [
                        simplify(hole, 0.00002 if airport else 0.00009)
                        for hole in holes
                    ]
                features.append(feature)

        def node(self, node):
            tags = dict(node.tags)
            if (
                tags.get("aeroway")
                not in {
                    "control_tower",
                    "navigationaid",
                    "gate",
                    "parking_position",
                    "holding_position",
                }
                and tags.get("man_made") != "tower"
            ):
                return
            point = [round(node.location.lon, 7), round(node.location.lat, 7)]
            if contains(point, airport_bounds):
                features.append(
                    {
                        "id": "node/" + str(node.id),
                        "tags": {k: v for k, v in tags.items() if k in allowed},
                        "geometry": [point],
                    }
                )

        def way(self, way):
            tags = dict(way.tags)
            airport = "aeroway" in tags
            road = tags.get("highway") in {
                "motorway",
                "motorway_link",
                "trunk",
                "trunk_link",
                "primary",
                "primary_link",
                "secondary",
                "secondary_link",
                "tertiary",
            }
            water = tags.get("natural") in {"water", "coastline"} or tags.get("waterway") in {
                "river",
                "canal",
            }
            land = tags.get("landuse") in {
                "residential",
                "industrial",
                "commercial",
                "forest",
                "farmland",
                "orchard",
            } or tags.get("natural") in {"wood", "scrub"}
            building = "building" in tags
            if not (airport or road or water or land or building):
                return
            # Cheap source-first bounding check avoids expanding millions of
            # unrelated city house rings into Python lists. The extra1km margin
            # is conservative; final selection still uses the real airfield.
            if building and not airport:
                try:
                    n=way.nodes[0]
                    south,west,north,east=airport_bounds
                    if not (south-.01<=n.lat<=north+.01 and west-.01<=n.lon<=east+.01):
                        return
                except (osmium.InvalidLocationError,IndexError):
                    return
            try:
                points = [[round(n.lon, 7), round(n.lat, 7)] for n in way.nodes]
            except osmium.InvalidLocationError:
                return
            if len(points) < 2 or not any(contains(p, OSM_BOUNDS) for p in points):
                return
            # Only airport buildings are included; broader residential areas
            # remain land-use polygons to keep the pack compact.
            if building and not (
                airport or any(contains(p, airport_bounds) for p in points)
            ):
                return
            landmark=way.id in {37891817,534332717,413226266}
            points = points if landmark else simplify(points, 0.000003 if airport or building else 0.00003)
            if land and len(points) < 4:
                return
            features.append(
                {
                    "id": "way/" + str(way.id),
                    "tags": tags if landmark else {k: v for k, v in tags.items() if k in allowed},
                    "geometry": points,
                }
            )

    # Keep the millions of untagged point callbacks in C++; only selected
    # features cross into Python. Area assembly still sees every required way.
    processor = (
        osmium.FileProcessor(str(path))
        .with_locations("flex_mem")
        .with_areas()
        .with_filter(
            osmium.filter.KeyFilter(
                "aeroway",
                "building",
                "highway",
                "landuse",
                "natural",
                "waterway",
                "man_made",
            )
        )
        .with_filter(Handler())
    )
    for _ in processor:
        pass
    return {
        "bounds": OSM_BOUNDS,
        "airportBounds": airport_bounds,
        "coordinates": "WGS84 longitude, latitude",
        "source": OSM_URL,
        "license": "ODbL-1.0",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "attribution": "© OpenStreetMap contributors",
        "features": features,
    }


def compact_scenery(osm):
    """Real airfield boundary prevents nearby residential houses bloating the pack."""
    from shapely.geometry import Polygon,Point
    airfield=next(f for f in osm['features'] if f['id']=='way/649268639')
    polygon=Polygon(airfield['geometry'])
    local_bounds=[33.91,-118.46,33.97,-118.35]
    cover_bounds=[33.86,-118.52,34.03,-118.26]
    kept=[]
    for f in osm['features']:
        tags,ps=f['tags'],f['geometry']
        airport_near=any(contains(p,osm['airportBounds']) for p in ps)
        inside=airport_near and any(polygon.covers(Point(p)) for p in ps)
        near=any(contains(p,local_bounds) for p in ps)
        cover=any(contains(p,cover_bounds) for p in ps)
        area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ps,ps[1:]))/2) if len(ps)>3 and ps[0]==ps[-1] else 0
        airport=('aeroway' in tags or 'building' in tags or tags.get('man_made')=='tower') and inside
        water=tags.get('natural')=='coastline' or tags.get('natural')=='water' and area>.000002 or tags.get('waterway')=='river'
        road=near and tags.get('highway') in {'motorway','trunk','primary','motorway_link','trunk_link','primary_link'}
        land=cover and area>.000008 and ('landuse' in tags or tags.get('natural') in {'wood','scrub'})
        if airport or water or road or land or f['id'] in {'way/37891817','way/534332717','way/413226266'}:kept.append(f)
    osm['features']=kept
    osm['scenerySelection']={'airportBuildingBoundary':airfield['id'],'nearbyDetailBounds':local_bounds,'landCoverBounds':cover_bounds,'note':'Buildings and aeroways restricted to actual LAX polygon; principal local roads, substantial local cover and full-bounds Pacific shoreline retained. DEM independently retains hills.'}


def complete_coastlines(osm,cache):
    """Follow real source coastline beyond a clipped regional PBF's endpoints.

    The BBBike city polygon ends inside the game DEM rectangle. Source node-way
    links are followed through the official OSM API until both continental shore
    ends cross the display bounds, so no open chain floods the land face.
    """
    import xml.etree.ElementTree as ET
    folder=cache/'osm-api';folder.mkdir(parents=True,exist_ok=True)
    fs={f['id']:f for f in osm['features'] if f['tags'].get('water')!='sea'}
    def xml(kind,ident,suffix=''):
        path=folder/(f'{kind}-{ident}'+('-'+suffix if suffix else '')+'.osm')
        if not path.exists():
            request=urllib.request.Request(f'https://api.openstreetmap.org/api/0.6/{kind}/{ident}'+('/'+suffix if suffix else ''),headers={'User-Agent':'pilot-sim-geography-builder/1.0'})
            with urllib.request.urlopen(request,timeout=60) as response:data=response.read()
            path.write_bytes(data)
        return ET.parse(path).getroot()
    for iteration in range(100):
        coast=[f for f in fs.values() if f['tags'].get('natural')=='coastline']
        counts=collections.Counter(tuple(v) for f in coast for v in [f['geometry'][0],f['geometry'][-1]])
        ends=[(f,v) for f in coast for v in [f['geometry'][0],f['geometry'][-1]] if counts[tuple(v)]==1 and contains(v,osm['bounds'])]
        if not ends:break
        added=0
        for f,v in ends:
            full=xml('way',f['id'].split('/')[1],'full');nodes={n.attrib['id']:[round(float(n.attrib['lon']),7),round(float(n.attrib['lat']),7)] for n in full.findall('node')}
            ident=min(nodes,key=lambda i:(nodes[i][0]-v[0])**2+(nodes[i][1]-v[1])**2)
            for w in xml('node',ident,'ways').findall('way'):
                tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')};key='way/'+w.attrib['id']
                if tags.get('natural')!='coastline' or key in fs:continue
                source=xml('way',w.attrib['id'],'full');ns={n.attrib['id']:[round(float(n.attrib['lon']),7),round(float(n.attrib['lat']),7)] for n in source.findall('node')};way=next(q for q in source.findall('way') if q.attrib['id']==w.attrib['id']);ps=[ns[n.attrib['ref']] for n in way.findall('nd')]
                fs[key]={'id':key,'tags':{k:v for k,v in tags.items() if k in ['natural','name']},'geometry':simplify(ps,.00003),'sourceSupplement':f'https://api.openstreetmap.org/api/0.6/way/{w.attrib["id"]}/full'};added+=1
        assert added,'Unresolved source coastline endpoint; refresh or inspect source snapshots'
    else:raise RuntimeError('Coastline traversal exceeded bounded100-source-step limit')
    osm['features']=list(fs.values())


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
    land_samples = []
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
            sea_samples.append((Point((a[0]+b[0])/2 + dy/length*0.00001,
                                     (a[1]+b[1])/2 - dx/length*0.00001),length))
            land_samples.append((Point((a[0]+b[0])/2 - dy/length*0.00001,
                                     (a[1]+b[1])/2 + dx/length*0.00001),length))
    polygons = list(polygonize(unary_union([clip.boundary] + lines)))
    water = []
    for poly in polygons:
        offshore=sum(weight for p,weight in sea_samples if poly.contains(p))
        onshore=sum(weight for p,weight in land_samples if poly.contains(p))
        if offshore <= onshore:
            continue
        water.append(poly)
    # Joining adjacent marine faces avoids seams at touching source ways.
    merged = unary_union(water)
    if merged.is_empty:
        raise ValueError("No sea polygons assembled from the source coastline")
    polygons = [merged] if merged.geom_type == "Polygon" else list(merged.geoms)
    result = []
    for i, poly in enumerate(polygons):
        feature = {"id": f"derived/sea/{i}",
                   "tags": {"natural": "water", "water": "sea", "name": "Pacific Ocean / Santa Monica Bay"},
                   "geometry": [[round(x,7), round(y,7)] for x,y in poly.exterior.coords],
                   "holes": [[[round(x,7),round(y,7)] for x,y in ring.coords] for ring in poly.interiors],
                   "sourceFeatureIds": [f["id"] for f in coasts if LineString(f["geometry"]).intersects(poly.boundary)],
                   "derivation": "Polygonized oriented OSM coastlines clipped by the scenery selection bounds; sea is right of source way direction. Rectangle edges are display clipping boundaries."}
        result.append(feature)
    osm["seaDerivation"] = {"method": "OSM coastline polygonization with island holes, bounded display clipping and source-segment-length-weighted offshore/onshore face classification", "sourceCoastlineCount": len(coasts), "polygonCount": len(result), "license": "ODbL-1.0"}
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


def departure_data(pack):
    """Source 86B / C6 / C / C3 / B3; no invented ground shortcuts."""
    fs={f['id']:f for f in pack['osm']['features']}
    runway=next(r for r in pack['runways'] if any(e['id']=='25R' for e in r['ends']))
    a=next(e for e in runway['ends'] if e['id']=='25R');b=next(e for e in runway['ends'] if e['id']!='25R')
    rad=math.pi/180;lx=6378137*rad*math.cos(a['latitude']*rad);ly=6378137*rad
    E=(b['longitude']-a['longitude'])*lx;N=(b['latitude']-a['latitude'])*ly;heading=math.atan2(E,N);c,s=math.cos(heading),math.sin(heading)
    def project(p):
        e=(p[0]-a['longitude'])*lx;n=(p[1]-a['latitude'])*ly
        return (e*c-n*s,-e*s-n*c)
    def distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])
    def point(p,source,name,kind='source-vertex'):return {'x':round(p[0],3),'z':round(p[1],3),'sourceId':source,'name':name,'kind':kind}
    def length(ps):return sum(math.hypot(a['x']-b['x'],a['z']-b['z']) for a,b in zip(ps,ps[1:]))
    # The first source C6 vertex nearest the lead-in is a documented automatic
    # reposition handoff, ~27m across the apron. It is not a manual taxi shortcut.
    stand=fs['way/1096142912'];sp=list(map(project,stand['geometry']));nose=sp[-1];before=sp[-2];l=distance(nose,before);fx=(nose[0]-before[0])/l;fz=(nose[1]-before[1])/l;yaw=math.atan2(fx,-fz);cg=(nose[0]-15*fx,nose[1]-15*fz)
    c6=fs['way/19658969'];c6ps=list(map(project,c6['geometry']));handoff=min(c6ps,key=lambda p:distance(p,sp[0]));startIndex=c6ps.index(handoff)
    selected=['way/19658969','way/872785977','way/872785978','way/159858554','way/857253617']
    # Split only the curated source corridor; sub-metre rounding joins preserve
    # actual intersections. This avoids traversing other parallel/crossing runways.
    segments=[]
    for ident in selected:
        f=fs[ident];ps=list(map(project,f['geometry']))
        for A,B in zip(ps,ps[1:]):
            if distance(A,B)>.05:segments.append({'a':A,'b':B,'f':f,'u':[0,1]})
    def project_seg(p,a,b):
        dx,dz=b[0]-a[0],b[1]-a[1];u=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/max(1e-8,dx*dx+dz*dz)));q=(a[0]+u*dx,a[1]+u*dz);return distance(p,q),u,q
    for i,A in enumerate(segments):
        ax,az=A['a'];dx,dz=A['b'][0]-ax,A['b'][1]-az
        for B in segments[i+1:]:
            bx,bz=B['a'];ex,ez=B['b'][0]-bx,B['b'][1]-bz;den=dx*ez-dz*ex
            if abs(den)>1e-8:
                u=((bx-ax)*ez-(bz-az)*ex)/den;v=((bx-ax)*dz-(bz-az)*dx)/den
                if 0<=u<=1 and 0<=v<=1:A['u'].append(u);B['u'].append(v)
            for p in [A['a'],A['b']]:
                d,u,q=project_seg(p,B['a'],B['b'])
                if d<.9:B['u'].append(u)
            for p in [B['a'],B['b']]:
                d,u,q=project_seg(p,A['a'],A['b'])
                if d<.9:A['u'].append(u)
    c3=fs['way/857253617'];c3ps=list(map(project,c3['geometry']));_,_,hold=project_seg((110,-941),c3ps[-2],c3ps[-1]);
    for p in [handoff,hold]:
        seg=min(segments,key=lambda a:project_seg(p,a['a'],a['b'])[0]);d,u,q=project_seg(p,seg['a'],seg['b']);assert d<1;seg['u'].append(u)
    positions=[];adj=collections.defaultdict(list)
    def node(p):
        for i,q in enumerate(positions):
            if distance(p,q)<.9:return i
        positions.append(p);return len(positions)-1
    for S in segments:
        us=sorted(set(round(u,9) for u in S['u']));ps=[(S['a'][0]+u*(S['b'][0]-S['a'][0]),S['a'][1]+u*(S['b'][1]-S['a'][1])) for u in us]
        for A,B in zip(ps,ps[1:]):
            i,j=node(A),node(B)
            if i!=j:adj[i].append((j,distance(A,B),S['f']));adj[j].append((i,distance(A,B),S['f']))
    first,last=node(handoff),node(hold);best={first:0};prev={};heap=[(0,first)]
    while heap:
        d,i=heapq.heappop(heap)
        if d>best[i]:continue
        if i==last:break
        for j,w,f in adj[i]:
            if positions[j][0]<105:continue
            nd=d+w
            if nd<best.get(j,float('inf')):best[j]=nd;prev[j]=(i,f);heapq.heappush(heap,(nd,j))
    assert last in best,('No actual LAX source route',handoff,hold)
    ids=[last];ways=[];i=last
    while i!=first:i,f=prev[i];ids.append(i);ways.append(f)
    ids.reverse();ways.reverse()
    route=[point(handoff,c6['id'],'C6')]+[point(positions[i],f['id'],f['tags'].get('ref','C6')) for i,f in zip(ids[1:],ways)];route[-1]=point(hold,c3['id'],'25R HOLD','game-holding-point')
    b3=fs['way/138935854'];b3ps=list(map(project,b3['geometry']));entry=[point(hold,c3['id'],'25R HOLD','game-holding-point')]+[point(p,b3['id'],'B3') for p in b3ps];end=b3ps[-1];lineup=(0,end[1]-60);entry.append(point(lineup,'OurAirports:7L/25R','25R','runway-centerline'))
    # Source B3 ends ~0.4m off the endpoint-derived axis; this short final join is
    # explicitly a game alignment segment, not a new surveyed taxiway.
    entry[-2]['kind']='source-runway-entry-arc'
    handYaw=math.atan2(route[1]['x']-route[0]['x'],-(route[1]['z']-route[0]['z']));holdYaw=math.atan2(entry[1]['x']-hold[0],-(entry[1]['z']-hold[1]))
    return {'schemaVersion':1,'airportId':'lax','runwayId':'25R','coordinateFrame':'Metres in active25R local tangentplane: x runwayright, z approachside, y aboveactive threshold; yaw0 follows25R forward(-z).',
      'stand':{'ref':'86B','sourceId':stand['id'],'longitude':stand['geometry'][-1][0],'latitude':stand['geometry'][-1][1],'x':round(cg[0],3),'z':round(cg[1],3),'yaw':yaw,'headingDegLocal':round(yaw/rad,3),'headingDegTrue':round((heading/rad+yaw/rad)%360,3),'nose':{'x':round(nose[0],3),'z':round(nose[1],3)},'cgSetbackM':15,'note':'Source86Bparkingway anchorsrealTerminal8stand. GameCG set15mbehindnosealonglead-in; no staticaircraftoccupiesstand.'},
      'handoff':{'x':round(handoff[0],3),'z':round(handoff[1],3),'yaw':handYaw,'sourceId':c6['id'],'note':'Automaticcrewpreparation abstracts pushback/apron reposition to adjacentactualC6sourcevertex (~27m fromlead-inapronendpoint); manualtaxistartsstationary onsource network.'},
      'taxiPoints':route,'hold':{'x':round(hold[0],3),'z':round(hold[1],3),'yaw':holdYaw,'sourceId':c3['id'],'sourceHoldingNodeId':'node/7992560258','isPublishedHoldingPosition':False,'note':'GameCGholdingpoint onactualC3outside25R protectedstrip, behind sourceB3holdingnode. Not aliveclearance.'},
      'entryPoints':entry,'lineup':{'x':0,'z':round(lineup[1],3),'yaw':0,'sourceId':'OurAirports:7L/25R','remainingRunwayM':round(math.hypot(E,N)+lineup[1],3),'note':'ManualsourceB3entry with60mstraightcenterlineafter nativearc.'},'taxiDistanceM':round(length(route),3),'entryDistanceM':round(length(entry),3),'routeReferences':['86B','C6','C','C3','B3','25R'],
      'sourceFeatureIds':list(dict.fromkeys([stand['id'],c6['id']]+[p['sourceId'] for p in route]+[b3['id'],'node/7992560258'])),
      'sources':[{'name':'OpenStreetMap contributors','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','dataFile':'lax.json','dataFetchedAt':pack['fetchedAt']},{'name':'OurAirports','license':'Unlicense / public domain','dataFile':'lax.json'}],
      'notes':['RealTerminal8stand86B andactualC6/C/C3/B3connectednetwork aretheplannedroute; thisisgame routing, notpublishedtaxiclearance.','Automaticpreparation includesa27mapronrepositiontoC6; noplayerpushback/tugcontrols.','SourceB3has native gradualentryarc. Final60mcenterlinesegment usesOurAirportsendpointaxis andretains~2.85kmremainingrunway.','Optionaltaxiskipstopsoutside runway; entry/lineup/stopping andseparatetakeoff clearance remainmanual.']}

def validate_data(pack,departure=None):
    from shapely.geometry import Polygon
    def finite(v):
        if isinstance(v,dict):return all(finite(x) for x in v.values())
        if isinstance(v,list):return all(finite(x) for x in v)
        return not isinstance(v,(int,float)) or math.isfinite(v)
    assert finite(pack)
    assert len(pack['dem']['heights'])==129*129
    fs={f['id']:f for f in pack['osm']['features']};assert len(fs)==len(pack['osm']['features'])
    for f in fs.values():
        assert f['geometry']
        if f['tags'].get('water')=='sea':assert Polygon(f['geometry'],f.get('holes',[])).is_valid
    if departure:
        assert finite(departure)
        assert all(i in fs for i in departure['sourceFeatureIds'])
        assert departure['runwayId']=='25R'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=pathlib.Path,
        default=pathlib.Path("/tmp/pilot-sim-lax-data"),
    )
    parser.add_argument(
        "--pbf", type=pathlib.Path, help="Use an existing BBBike LosAngeles PBF"
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=ROOT / "game/src/airports/data/lax.json",
    )
    parser.add_argument(
        "--departure-only",
        action="store_true",
        help="Rebuild the curated taxi derivative from an existing pack",
    )
    parser.add_argument("--geography-only", action="store_true", help="Rebuild source geography without the departure derivative")
    args = parser.parse_args()
    if args.departure_only:
        pack = json.loads(args.output.read_text())
        target = args.output.with_name(args.output.stem + "-departure.json")
        departure = departure_data(pack)
        validate_data(pack, departure)
        target.write_text(
            json.dumps(departure, ensure_ascii=False, indent=2) + "\n"
        )
        print(target)
        return
    cache = args.cache
    pbf = args.pbf or cache / "LosAngeles-2026-11-14.osm.pbf"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        airport_future = pool.submit(airport_data, cache)
        terrain_future = pool.submit(terrain_data, cache)
        if not pbf.exists():
            print("Downloading OSM regional extract", flush=True)
            download(OSM_URL, pbf)
        print("Extracting OSM geometry", flush=True)
        osm = osm_data(pbf)
        print(f"Extracted {len(osm['features'])} source features; selecting local scenery", flush=True)
        compact_scenery(osm)
        complete_coastlines(osm,cache)
        sea_polygons(osm)
        clip_scenery(osm)
        print(f"Selected {len(osm['features'])} scenery features including source-derived sea", flush=True)
        airport, runways = airport_future.result()
        dem = terrain_future.result()
    pack = {
        "schemaVersion": 1,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "airport": airport,
        "runways": runways,
        "osm": osm,
        "dem": dem,
        "sources": [
            {
                "name": "OurAirports",
                "url": "https://github.com/davidmegginson/ourairports-data",
                "license": "Unlicense / public domain",
                "snapshots": [{"filename": n, "sha256": hashlib.sha256((cache/n).read_bytes()).hexdigest()} for n in ["airports.csv", "runways.csv"]],
            },
            {
                "name": "OpenStreetMap contributors / BBBike",
                "url": OSM_URL,
                "license": "ODbL-1.0",
                "sha256": hashlib.sha256(pbf.read_bytes()).hexdigest(),
            },
            {
                "name": "Mapzen Terrain Tiles / USGS",
                "snapshots": [{"filename": str(p.relative_to(cache)), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((cache/"terrarium").rglob("*.png"))],
                "url": "https://registry.opendata.aws/terrain-tiles/",
                "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
            },
        ],
    }
    pack['sources'].append({'name':'OpenStreetMap API coastline chain supplements','url':'https://api.openstreetmap.org/api/0.6/','license':'ODbL-1.0','snapshots':[{'filename':str(a.relative_to(cache)),'sha256':hashlib.sha256(a.read_bytes()).hexdigest()} for a in sorted((cache/'osm-api').glob('*.osm'))]})
    print("Validating source geometry and curated departure", flush=True)
    departure = None if args.geography_only else departure_data(pack)
    validate_data(pack, departure)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    target = args.output.with_name(args.output.stem + "-departure.json")
    if not args.geography_only:
        target.write_text(
            json.dumps(departure, ensure_ascii=False, indent=2) + "\n"
        )
    print(
        json.dumps(
            {
                "path": str(args.output),
                "bytes": args.output.stat().st_size,
                "features": len(osm["features"]),
                "demSamples": len(dem["heights"]),
                "terminals": [
                    f["id"]
                    for f in osm["features"]
                    if f["tags"].get("aeroway") == "terminal"
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
