#!/usr/bin/env python3
"""Build attributed LAX city data and georeferenced NAIP texture assets.

Build-only dependencies: osmium, ijson, shapely, pillow, numpy, rasterio.
The source PBF and intermediate COG reads live in --cache, outside the checkout.
The game makes no external imagery/map requests. NAIP imagery is 2022 photography;
OSM geometry is the explicitly fingerprinted 2026-11-14 regional snapshot.
"""
from __future__ import annotations
import argparse, concurrent.futures, datetime, hashlib, json, math, pathlib, urllib.parse, urllib.request
import osmium
import ijson
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union
from shapely import contains_xy, prepare
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from affine import Affine
ROOT=pathlib.Path(__file__).resolve().parents[1]
BOUNDS=[33.87,-118.53,34.09,-118.13]
TAGS={'name','name:en','building','building:part','height','min_height','building:levels','roof:shape','roof:height','roof:material','building:colour','building:material','highway','landuse','natural','leisure','amenity','man_made','water','waterway','aeroway','area','width','surface','start_date','wikidata','wikipedia'}
LANDMARK_NAMES={'SoFi Stadium','Kia Forum','The Forum','Wilshire Grand Center','Wilshire Grand','U.S. Bank Tower','US Bank Tower','Aon Center','Gas Company Tower','One California Plaza','Two California Plaza','City National Plaza','Bank of America Plaza','777 Tower','Figueroa at Wilshire','1100 Wilshire','Citigroup Center'}

def dump(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def geographic_shape(feature):
 try:
  p=Polygon(feature['geometry'],feature.get('holes',[]));return p if p.is_valid else p.buffer(0)
 except Exception:return Polygon()
def hval(tags,default):
 v=tags.get('height')
 if v:
  try:return float(v.replace('m','').strip()),'OSM height'
  except ValueError:pass
 if tags.get('building:levels'):
  try:return float(tags['building:levels'])*3.2,'OSM levels × estimated3.2m'
  except ValueError:pass
 return default,'visual estimate'
def cleaned(points,tol=.000006):
 if len(points)<3:return points
 try:
  if points[0]==points[-1]:g=Polygon(points);g=g if g.is_valid else g.buffer(0);g=g.simplify(tol,preserve_topology=True);p=list(g.exterior.coords) if g.geom_type=='Polygon'else points
  else:p=list(LineString(points).simplify(tol).coords)
  return [[round(a,7),round(b,7)]for a,b in p]
 except Exception:return points

def bounded_raw(raw):
 """Reject irrelevant footprints before allocating Shapely objects.

 Source cache is intentionally outside Git; this streaming step bounds both
 memory and runtime output and never invents building positions.
 """
 context=[];reserved=[];cells={};count=0
 with raw.open('rb')as stream:
  for f in ijson.items(stream,'item',use_float=True):
   count+=1;t=f['tags'];p=f['geometry'];lon,lat=p[0]
   if not(t.get('building')or t.get('building:part')):
    if t.get('name')in LANDMARK_NAMES or t.get('highway')in{'motorway','trunk','primary','secondary','motorway_link','trunk_link','primary_link'}or t.get('landuse')or t.get('natural')in{'beach','water','wood','scrub','wetland'}or t.get('leisure')in{'park','golf_course'}:context.append(f)
    continue
   named=t.get('name')in LANDMARK_NAMES
   stadium=-118.347<lon<-118.333 and 33.946<lat<33.963
   downtown=-118.272<lon<-118.244 and 34.038<lat<34.067
   hv,_=hval(t,0)
   if named or stadium or downtown and hv>=130:reserved.append(f);continue
   distance=math.hypot((lon+118.3975)*92200,(lat-33.9404)*111320)
   corridor=-118.40<lon<-118.14 and 33.915<lat<33.973
   if distance>7900 and not corridor:continue
   if hv>90:continue
   cell=(math.floor((lon+119)*92200/260),math.floor(lat*111320/260))
   area=abs(sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(p,p[1:])))*.5*92200*111320
   score=min(area,3500)*.002+hv*.2-distance*.0001
   bucket=cells.setdefault(cell,[]);bucket.append((score,f));bucket.sort(key=lambda x:-x[0]);del bucket[6:]
 selected=context+reserved+[f for fs in cells.values()for _,f in fs]
 print('bounded cache selection',count,'to',len(selected),'features',flush=True);return selected

def extract(pbf,cache):
 raw=cache/'city-features-raw.json'
 if raw.exists():return bounded_raw(raw)
 out=[];names=[];t=datetime.datetime.now();processed=0
 filters=osmium.filter.KeyFilter('building','building:part','highway','landuse','natural','leisure','amenity','name','waterway','aeroway')
 processor=osmium.FileProcessor(str(pbf)).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY|osmium.osm.AREA)).with_filter(filters)
 for o in processor:
  processed+=1
  if o.is_area() and o.from_way():continue
  ts=o.tags
  relevant=bool(ts.get('building')or ts.get('building:part')or ts.get('highway')or ts.get('landuse')or ts.get('natural')in {'beach','water','scrub','wood','wetland','coastline'}or ts.get('leisure')in{'stadium','park','golf_course','pitch'}or ts.get('name')in LANDMARK_NAMES or ts.get('aeroway')in{'aerodrome','apron','runway','taxiway'})
  if not relevant:continue
  try:
   if o.is_way():
    if not o.nodes or not o.nodes[0].location.valid():continue
    first=o.nodes[0];lon,lat=first.lon,first.lat
    # Wider envelope admits large source rings crossing the final image area.
    if not BOUNDS[1]-.05<lon<BOUNDS[3]+.05 or not BOUNDS[0]-.04<lat<BOUNDS[2]+.04:continue
    rings=[([[round(n.lon,7),round(n.lat,7)]for n in o.nodes],[])]
    oid=f'way/{o.id}'
   else:
    rings=[]
    for ring in o.outer_rings():
     p=[[round(n.lon,7),round(n.lat,7)]for n in ring]
     if not p or not any(BOUNDS[1]-.03<a<BOUNDS[3]+.03 and BOUNDS[0]-.03<b<BOUNDS[2]+.03 for a,b in p):continue
     hs=[[[round(n.lon,7),round(n.lat,7)]for n in r]for r in o.inner_rings(ring)];rings.append((p,hs))
    oid=f'relation/{o.orig_id()}'
   tags={k:v for k,v in ts if k in TAGS}
  except (RuntimeError,ValueError):continue
  for ix,(p,holes)in enumerate(rings):
   if len(p)<2:continue
   f={'id':oid+(f'/{ix}'if ix else''),'tags':tags,'geometry':cleaned(p,.000003 if tags.get('building')or tags.get('building:part')else .000012)}
   if holes:f['holes']=[cleaned(h,.000006)for h in holes]
   out.append(f)
   if tags.get('name')in LANDMARK_NAMES:
    names.append(f);dump(cache/'landmark-progress.json',names)
  if len(out)%20000==0:print('source features',len(out),flush=True)
 dump(raw,out);print('extracted',len(out),'seconds',(datetime.datetime.now()-t).total_seconds(),flush=True);del out;return bounded_raw(raw)

def landmark_record(f,default=30):
 p=geographic_shape(f);center=p.centroid if not p.is_empty else Point(f['geometry'][0]);height,source=hval(f['tags'],default)
 return {'id':f['id'],'name':f['tags'].get('name',''),'geometry':f['geometry'],'latitude':round(center.y,7),'longitude':round(center.x,7),'heightM':height,'heightSource':source,'tags':f['tags']}

def select(raw):
 original=json.loads((ROOT/'game/src/airports/data/lax.json').read_text());airport=next(f for f in original['osm']['features']if f['id']=='way/649268639');airport_poly=geographic_shape(airport)
 near=[f for f in raw if (f['tags'].get('building')or f['tags'].get('building:part'))and len(f['geometry'])>=4]
 named={}
 for f in raw:
  n=f['tags'].get('name','')
  if n in LANDMARK_NAMES and len(f['geometry'])>=4:
   rank=lambda x:(bool(x['tags'].get('building')or x['tags'].get('building:part')),x['tags'].get('leisure')=='stadium',bool(x['tags'].get('height')))
   if n not in named or rank(f)>rank(named[n]):named[n]=f
 sofi=named.get('SoFi Stadium');forum=named.get('Kia Forum',named.get('The Forum'));assert sofi and forum,'missing main stadium footprints'
 sofi_center=geographic_shape(sofi).centroid
 sr=landmark_record(sofi,45);sr['stadiumGeometry']=sr['geometry'];sr['stadiumId']=sr['id']
 components=[sofi]
 for f in near:
  if f['id']==sofi['id']or f['tags'].get('roof:material')!='ETFE':continue
  p=geographic_shape(f)
  if p.is_empty or p.area*92200*111320<3000:continue
  if math.hypot((p.centroid.x-sofi_center.x)*92200,(p.centroid.y-sofi_center.y)*111320)<700:components.append(f)
 if len(components)>1:
  canopy=unary_union([geographic_shape(f)for f in components])
  if canopy.geom_type=='MultiPolygon':canopy=max(canopy.geoms,key=lambda p:p.area)
  sr.update({'geometry':[[round(a,7),round(b,7)]for a,b in canopy.exterior.coords],'sourceCanopyIds':[f['id']for f in components],'geometryDerivation':'union of original source stadium body and adjacent ETFE roof-part outlines; see sourceCanopyIds'})
  center=canopy.centroid;sr['latitude']=round(center.y,7);sr['longitude']=round(center.x,7)
 sr['heightM']=45;sr['heightSource']='visual canopy apex estimate above local terrain; source building footprint, stadium partly below grade';sr['roofHeightM']=45;sr['rimHeightM']=25
 fr=landmark_record(forum,19.3)
 towers=[]
 for name,f in named.items():
  if name in {'SoFi Stadium','Kia Forum','The Forum','City National Plaza'}:continue
  if not(f['tags'].get('building')or f['tags'].get('building:part')):continue
  rec=landmark_record(f,80)
  if rec['heightM']>=130:towers.append(rec)
 # Select real named/unnamed high tower footprints, not their lower parcel/podium.
 for f in near:
  p=geographic_shape(f)
  if p.is_empty or not(-118.27<p.centroid.x<-118.245 and 34.04<p.centroid.y<34.065):continue
  h,source=hval(f['tags'],0)
  if h<170 or any(p.intersects(geographic_shape(t))and p.intersection(geographic_shape(t)).area>min(p.area,geographic_shape(t).area)*.4 for t in towers):continue
  r=landmark_record(f,h)
  if not r['name']:r['name']='Downtown tower '+f['id']
  towers.append(r)
 towers=sorted(towers,key=lambda f:(-f['heightM'],f['id']))[:14]
 exclude={sr['id'],sr.get('stadiumId'),fr['id'],*[t['id']for t in towers]}
 buildings=[];seen=set();buckets={}
 for f in near:
  if f['id']in exclude:continue
  p=geographic_shape(f)
  if p.is_empty or p.area<=0:continue
  c=p.centroid;lon,lat=c.x,c.y
  if not BOUNDS[1]<lon<BOUNDS[3]or not BOUNDS[0]<lat<BOUNDS[2]or airport_poly.covers(c):continue
  # A bounded selection surrounds the airport and the real 25R approach corridor.
  distance=math.hypot((lon+118.3975)*92200,(lat-33.9404)*111320)
  corridor=-118.40<lon<-118.14 and 33.915<lat<33.973
  if distance>7500 and not corridor:continue
  h,hs=hval(f['tags'],6.5 if f['tags'].get('building')in{'house','residential','apartments','detached'}else 9)
  area=p.area*92200*111320
  if area<28 or area>45000 or h>90:continue
  signature=(round(c.x,6),round(c.y,6),round(p.area,9))
  if signature in seen:continue
  seen.add(signature)
  if any(p.intersects(geographic_shape(t))for t in[sr,fr]+towers):continue
  f={**f,'heightM':round(h,2),'heightSource':hs}
  cell=(math.floor((lon+119)*92200/260),math.floor(lat*111320/260))
  score=min(area,3500)*.002+h*.2-distance*.0001
  buckets.setdefault(cell,[]).append((score,f))
 for cell,fs in buckets.items():buildings.extend([f for _,f in sorted(fs,key=lambda x:-x[0])[:2]])
 buildings=sorted(buildings,key=lambda f:hashlib.sha1(f['id'].encode()).hexdigest())[:1900]
 context=[];clip_bounds=box(BOUNDS[1],BOUNDS[0],BOUNDS[3],BOUNDS[2])
 for f in raw:
  t=f['tags'];n=len(f['geometry'])
  if t.get('building')or t.get('building:part')or f['id']in exclude or n<2 or t.get('aeroway'):continue
  p=f['geometry'];xs=[v[0]for v in p];ys=[v[1]for v in p]
  if max(xs)<BOUNDS[1]or min(xs)>BOUNDS[3]or max(ys)<BOUNDS[0]or min(ys)>BOUNDS[2]:continue
  if t.get('highway'):
   kind=t['highway'];length=sum(math.hypot((b[0]-a[0])*92200,(b[1]-a[1])*111320)for a,b in zip(p,p[1:]))
   minimum=120 if kind in{'motorway','trunk'}else 200 if kind in{'motorway_link','trunk_link'}else 500 if kind=='primary'else 1000
   if length<minimum:continue
  else:
   if not(t.get('landuse')or t.get('natural')in{'beach','water','wood','scrub','wetland'}or t.get('leisure')in{'park','golf_course'}):continue
   area=geographic_shape(f).area*92200*111320
   if area<(1000 if t.get('natural')=='beach'else 10000 if t.get('natural')=='water'else 50000):continue
  f={**f,'geometry':cleaned(f['geometry'],.00005)}
  if f.get('holes'):f['holes']=[cleaned(h,.00005)for h in f['holes']]
  context.append(f)
 context=sorted(context,key=lambda f:f['id'])
 return {'features':context+buildings,'landmarks':{'sofi':sr,'forum':fr,'downtown':towers},'selection':{'buildingCount':len(buildings),'contextFeatureCount':len(context),'method':'real footprint sample; up to2 source buildings per260m cell in7.5km airport region and25R approach corridor; max1900; excludes source airport boundary and landmarks','contextMethod':'curated major road segments and substantial land/beach/water polygons; shorter streets remain visible in actual NAIP imagery, not duplicated as runtime geometry','sourceAirportBoundary':airport['id'],'heightEstimates':'unavailable heights use OSM levels×3.2m or6.5/9m visual estimate; not surveyed'}},original


def get_catalog(cache):
 p=cache/'naip-stac-2022.json'
 if p.exists():return json.loads(p.read_text())
 url='https://planetarycomputer.microsoft.com/api/stac/v1/search?'+urllib.parse.urlencode({'collections':'naip','bbox':','.join(map(str,[BOUNDS[1],BOUNDS[0],BOUNDS[3],BOUNDS[2]])),'datetime':'2022-01-01T00:00:00Z/2022-12-31T23:59:59Z','limit':'100'})
 try:d=json.load(urllib.request.urlopen(url,timeout=40))
 except Exception:
  fallback=pathlib.Path('/tmp/lax-naip-access-2');assert fallback.exists();d=json.loads(fallback.read_text())
 d['features']=[f for f in d['features']if f['properties'].get('naip:year')=='2022'];assert len(d['features'])>=20;dump(p,d);return d

def image_config():
 overview={'id':'overview','path':'assets/cities/lax/overview.webp','bounds':BOUNDS,'width':4000,'height':2650,'sourceOverviewLevel':3}
 tiles=[]
 for j in range(2):
  for i in range(4):tiles.append({'id':f'detail-{j}-{i}','path':f'assets/cities/lax/detail-{j}-{i}.webp','bounds':[round(33.91+j*.04,7),round(-118.46+i*.0375,7),round(33.91+(j+1)*.04,7),round(-118.46+(i+1)*.0375,7)],'width':1024,'height':1024,'sourceOverviewLevel':1})
 return overview,tiles

def warp_piece(item,spec,cache):
 s,w,n,e=spec['bounds'];W,H=spec['width'],spec['height'];a,b,c,d=item['bbox'];x0=max(0,int(math.floor((a-w)/(e-w)*W)));x1=min(W,int(math.ceil((c-w)/(e-w)*W)));y0=max(0,int(math.floor((n-d)/(n-s)*H)));y1=min(H,int(math.ceil((n-b)/(n-s)*H)))
 if x1<=x0 or y1<=y0:return None
 path=cache/'warps'/f"{spec['id']}-{item['id']}.png"
 if path.exists():return(x0,y0,np.array(Image.open(path)))
 arr=np.zeros((3,y1-y0,x1-x0),dtype='uint8');url=item['assets']['image']['href'];transform=from_bounds(w,s,e,n,W,H)*Affine.translation(x0,y0)
 with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES',GDAL_HTTP_TIMEOUT='30',GDAL_HTTP_MAX_RETRY='2'):
  with rasterio.open(url,overview_level=spec['sourceOverviewLevel'])as src:
   reproject(source=rasterio.band(src,[1,2,3]),destination=arr,src_transform=src.transform,src_crs=src.crs,dst_transform=transform,dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=1)
 rgb=np.moveaxis(arr,0,-1);rgba=np.dstack([rgb,np.where(np.any(rgb,axis=-1),255,0).astype('uint8')]);path.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(rgba).save(path);return(x0,y0,rgba)

def sea_mask(overview=None,path='assets/cities/lax/sea-mask.png'):
 """Rasterize only the existing source ocean, preserving every island hole.

 Buffer in atlas-pixel coordinates so a white pixel's complete cell stays
 conservatively inside ocean. Photographic colour never classifies water.
 """
 overview=overview or image_config()[0];south,west,north,east=overview['bounds'];W,H=overview['width'],overview['height']
 airport_path=ROOT/'game/src/airports/data/lax.json';airport=json.loads(airport_path.read_text());features=[f for f in airport['osm']['features']if f['tags'].get('water')=='sea']
 assert features,'existing LAX sea polygons missing'
 def pixel_ring(points):return [((lon-west)/(east-west)*W,(north-lat)/(north-south)*H)for lon,lat in points]
 polygons=[Polygon(pixel_ring(f['geometry']),[pixel_ring(h)for h in f.get('holes',[])])for f in features]
 water=unary_union(polygons).intersection(box(0,0,W,H)).buffer(-.708,join_style=2)
 assert not water.is_empty;prepare(water);mask=np.zeros((H,W),dtype='uint8');xs=np.arange(W,dtype='float64')+.5
 for row in range(0,H,128):
  stop=min(H,row+128);ys=np.arange(row,stop,dtype='float64')+.5
  mask[row:stop]=np.where(contains_xy(water,xs[None,:],ys[:,None]),255,0).astype('uint8')
 dest=ROOT/'public'/path;dest.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(mask,'L').save(dest,'PNG',optimize=True)
 return {'path':path,'bounds':overview['bounds'],'width':W,'height':H,'sha256':sha(dest),'bytes':dest.stat().st_size,'source':'existing LAX OSM sea polygons','sourceFeatureIds':[f['id']for f in features],'sourceHoleCount':sum(len(f.get('holes',[]))for f in features),'sourceSitePath':'assets/maps/lax-source.json','sourceAirportSha256':sha(airport_path),'orientation':'north-up; white=ocean,black=land/island holes/outside source','processing':'Lossless8-bit grayscale. Source polygons and holes transformed to atlas pixel coordinates; ocean conservatively inset0.708pixel before pixel-centre containment, so white pixel cells lie wholly in source water. No photographic colour classification; source geography unchanged.'}

def imagery(cache):
 catalog=get_catalog(cache);items=sorted(catalog['features'],key=lambda x:x['id']);overview,tiles=image_config();metadata=[]
 for spec in[overview]+tiles:
  dst=ROOT/'public'/spec['path'];dst.parent.mkdir(parents=True,exist_ok=True)
  if not dst.exists():
   result=np.zeros((spec['height'],spec['width'],4),dtype='uint8')
   with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
    for piece in pool.map(lambda f:warp_piece(f,spec,cache),items):
     if piece is None:continue
     x,y,img=piece;h,w=img.shape[:2];mask=img[:,:,3]>0;result[y:y+h,x:x+w][mask]=img[mask]
   Image.fromarray(result).save(dst,'WEBP',quality=89,method=6,exact=True)
  md={k:v for k,v in spec.items()if k!='sourceOverviewLevel'};md.update({'sha256':sha(dst),'bytes':dst.stat().st_size});metadata.append(md);print('imagery',spec['id'],md['bytes'],flush=True)
 dates=sorted({f['properties']['datetime']for f in items})
 return {'kind':'NAIP orthophotography','projection':'EPSG:4326; bounds=south,west,north,east; pixels north-up','overview':metadata[0],'tiles':metadata[1:],'seaMask':sea_mask(),'captureDates':dates,'copyright':'USDA Farm Service Agency / NAIP2022; public domain with attribution','license':'Public Domain with Attribution','licenseUrl':'https://registry.opendata.aws/naip/','catalog':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip','processing':'Raw RGB bands1,2,3 from source0.6m COG; bilinear reproject/resample; overview source pyramid16x, detail4x; WebP quality89; alpha0 only where no source coverage. Source imagery is2022, not a2026 photograph.','catalogSha256':sha(cache/'naip-stac-2022.json'),'sourceItems':[{'stacSha256':hashlib.sha256(json.dumps(f,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'id':f['id'],'datetime':f['properties']['datetime'],'gsdM':f['properties'].get('gsd'),'bbox':f['bbox'],'href':f['assets']['image']['href']}for f in items]}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('/tmp/pilot-sim-lax-city-data'));ap.add_argument('--pbf',type=pathlib.Path,default=pathlib.Path('/tmp/pilot-sim-lax-data/LosAngeles-2026-11-14.osm.pbf'));ap.add_argument('--skip-imagery',action='store_true');ap.add_argument('--imagery-only',action='store_true');args=ap.parse_args();args.cache.mkdir(parents=True,exist_ok=True)
 md=imagery(args.cache)if not args.skip_imagery else None
 if args.imagery_only:
  dump(ROOT/'public/assets/cities/lax/imagery.json',md);return
 raw=extract(args.pbf,args.cache);selected,old=select(raw)
 data={'version':1,'airportId':'lax','bounds':BOUNDS,'provenance':{'osm':{'source':'https://download.bbbike.org/osm/bbbike/LosAngeles/LosAngeles.osm.pbf','snapshot':'2026-11-14','sha256':sha(args.pbf),'license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','attribution':'© OpenStreetMap contributors / ODbL','derivedDatabase':'assets/maps/lax-city-source.json'},'baseAirportSource':{'file':'lax-source.json','sitePath':'assets/maps/lax-source.json','departureFile':'lax-departure.json','sources':old['sources']},'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'modelNotes':'Source footprints/anchors retained. Heights/roof surfaces marked estimates where not tagged; ordinary city geometry is sampled and not exhaustive. Physical terrain/coast/runway/stand sources are unchanged.'},**selected}
 if md:data['imagery']=md;dump(ROOT/'public/assets/cities/lax/imagery.json',md)
 dump(ROOT/'game/src/airports/data/lax-city.json',data);dump(ROOT/'public/assets/maps/lax-city-source.json',data);print('city JSON bytes',(ROOT/'game/src/airports/data/lax-city.json').stat().st_size,'buildings',selected['selection']['buildingCount'],'landmarks',[(x['name'],x['heightM'])for x in selected['landmarks']['downtown']],flush=True)
if __name__=='__main__':main()
