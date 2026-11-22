#!/usr/bin/env python3
"""Merge dated CC-BY East Asian footprints with ODbL OSM context, offline.

Geometry remains source-derived. Missing heights/type/colours use stable local
neighbourhood estimates; these are not surveyed heights or photographic facades.
"""
import collections,hashlib,json,math,pathlib,re,time,sys
from city_roof_sampling import RoofSampler
import numpy as np,osmium,pyproj,shapefile
from PIL import Image
from shapely.geometry import Polygon,Point,LineString,shape
from shapely.geometry.polygon import orient
from shapely.ops import transform
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-xiaoshan-city');OUT=CACHE/'buildings.jsonl';RAW=CACHE/'building-candidates.jsonl';started=time.time()
airport=json.loads((ROOT/'game/src/airports/data/xiaoshan.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='07'for e in r['ends']));a=next(e for e in ends if e['id']=='07');b=next(e for e in ends if e['id']!='07');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def project(lon,lat):
 e=(np.asarray(lon)-a['longitude'])*east;n=(np.asarray(lat)-a['latitude'])*north
 return e*co-n*si,-e*si-n*co
def unproject(x,z):return a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north
def polygon(coords,holes=[]):
 p=Polygon([project(*q)for q in coords],[[project(*q)for q in h]for h in holes]);return p if p.is_valid else p.buffer(0)
PBF=pathlib.Path('/tmp/pilot-sim-xiaoshan-data/zhejiang-latest.osm.pbf')
if '--from-candidates' not in sys.argv:
 perimeters=[polygon(f['geometry'],f.get('holes',[]))for f in airport['osm']['features']if f['tags'].get('aeroway')=='aerodrome'];excluded=STRtree(perimeters)
 water=[];roads=[];land=[];landtags=[];osm=[];seen=set()
 PBF=pathlib.Path('/tmp/pilot-sim-xiaoshan-data/zhejiang-latest.osm.pbf')
 processor=osmium.FileProcessor(str(PBF)).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY|osmium.osm.AREA)).with_filter(osmium.filter.KeyFilter('building','landuse','natural','water','waterway','highway'))
 def add_osm(oid,t,coords,holes=[]):
  if not coords:return
  x,z=project(*coords[0])
  if abs(x)>31000 or abs(z)>31000:return
  closed=coords[0]==coords[-1]
  if t.get('highway')in{'motorway','trunk','primary','secondary','tertiary','residential','unclassified','service','motorway_link','trunk_link','primary_link'}and len(coords)>1:
   width={'motorway':26,'trunk':22,'primary':16,'secondary':12,'tertiary':9,'residential':6,'unclassified':6,'service':4}.get(t['highway'],9);roads.append(LineString([project(*q)for q in coords]).buffer(width/2));return
  if not closed or len(coords)<4:return
  try:p=polygon(coords,holes)
  except Exception:return
  if p.geom_type!='Polygon' or p.is_empty:return
  if t.get('natural')=='water' or t.get('water') or t.get('landuse')=='reservoir':water.append(p);return
  if t.get('landuse')in{'residential','industrial','commercial','retail','farmland','forest','grass','orchard'}:land.append(p);landtags.append(t['landuse']);return
  if t.get('building')and t['building']not in{'no','construction','ruins','roof','greenhouse','carport','shed','sty','bunker','bridge','pavilion','gatehouse'}and oid not in seen:
   if p.area<12 or p.area>180000 or excluded.query(p.representative_point(),predicate='intersects').size:return
   seen.add(oid);osm.append((oid,t,p))
 for o in processor:
  try:
   if o.is_way():add_osm('way/'+str(o.id),dict(o.tags),[(n.lon,n.lat)for n in o.nodes])
   elif not o.from_way():
    for ix,r in enumerate(o.outer_rings()):add_osm('relation/'+str(o.orig_id())+('/'+str(ix)if ix else''),dict(o.tags),[(n.lon,n.lat)for n in r],[[(n.lon,n.lat)for n in h]for h in o.inner_rings(r)])
  except (RuntimeError,ValueError):pass
 print('OSM context',len(osm),'buildings',len(water),'water',len(land),'landuse',len(roads),'roads','seconds',round(time.time()-started,1),flush=True)
 water_tree=STRtree(water);road_tree=STRtree(roads);land_tree=STRtree(land);osm_tree=STRtree([p for _,_,p in osm]);cells={};height_hints=collections.defaultdict(list)
 manifest=json.loads((ROOT/'public/assets/cities/xiaoshan/imagery-v1.json').read_text());rec=manifest['overview'];s,w,n,e=rec['bounds'];image=np.asarray(Image.open(ROOT/'public'/rec['path']).convert('RGB'))
 def rgb_for(p):
  q=p.representative_point();lon,lat=unproject(q.x,q.y);x=min(image.shape[1]-2,max(1,int((lon-w)/(e-w)*image.shape[1])));y=min(image.shape[0]-2,max(1,int((n-lat)/(n-s)*image.shape[0])));rgb=image[y-1:y+2,x-1:x+2].reshape(-1,3).astype('float32');r,g,b=rgb.T;valid=((r+g+b)>120)&(g<r*1.18)&(b<r*1.65)
  return list(map(int,np.median(rgb[valid],axis=0)))if np.any(valid)else[155,152,143]
 def seed_for(s):
  h=2166136261
  for c in s:h=((h^ord(c))*16777619)&0xffffffff
  return h
 def tagged_height(t):
  try:
   text=t.get('height','');v=float(re.match(r'\s*([0-9.]+)',text).group(1))*(.3048 if 'ft'in text or "'"in text else 1)
   if 2<=v<=350:return round(v,2),0
  except Exception:pass
  try:
   v=float(t['building:levels'])*3.1
   if 2<=v<=350:return round(v,2),1
  except Exception:pass
  return None,2
 count=0;counts=collections.Counter();duplicate=0
 with RAW.open('w')as raw:
  def emit(oid,p,t={}):
   global count
   if p.area<12 or p.area>180000:return
   p=orient(p.simplify(.25,preserve_topology=True),sign=-1);x0,z0,x1,z1=p.bounds
   if max(x1-x0,z1-z0)>700:return
   q=p.representative_point();cx,cz=q.x,q.y
   if abs(cx)>30350 or abs(cz)>30350 or excluded.query(q,predicate='intersects').size or water_tree.query(q,predicate='intersects').size or road_tree.query(q,predicate='intersects').size:return
   h,source=tagged_height(t);cell=(math.floor(cx/400),math.floor(cz/400));summary=cells.setdefault(cell,[0,0]);summary[0]+=1;summary[1]+=p.area
   if h is not None:height_hints[cell].append(h)
   use='';indexes=land_tree.query(q,predicate='intersects')
   if len(indexes):use=landtags[min(indexes,key=lambda i:land[i].area)]
   seed=seed_for(oid);rgb=rgb_for(p);rings=[[[round(x,2),round(z,2)]for x,z in r.coords[:-1]]for r in[p.exterior,*p.interiors]]
   raw.write(json.dumps([oid,h,source,seed,rgb,rings,round(p.area,2),round(cx,2),round(cz,2),use,t.get('building','')],separators=(',',':'))+'\n');count+=1;counts['osm'if not oid.startswith('eab/')else'eab']+=1
   if count%50000==0:print('city candidates',count,'seconds',round(time.time()-started,1),flush=True)
  for oid,t,p in osm:emit(oid,p,t)
  # Source projections use a common UTM49N grid even east of the normal zone;
  # explicitly transform the declared WKT, never reinterpret it as WGS84/GCJ02.
  for city_index,city in enumerate(['Hangzhou','Jiaxing','Shaoxing'],1):
   crs=pyproj.CRS.from_wkt((CACHE/(city+'.prj')).read_text());inverse=pyproj.Transformer.from_crs(crs,4326,always_xy=True);forward=pyproj.Transformer.from_crs(4326,crs,always_xy=True)
   lonlat=[unproject(x,z)for x,z in[(-31000,-31000),(-31000,31000),(31000,-31000),(31000,31000)]];xy=[forward.transform(*p)for p in lonlat];bbox=(min(p[0]for p in xy),min(p[1]for p in xy),max(p[0]for p in xy),max(p[1]for p in xy));reader=shapefile.Reader(str(CACHE/(city+'.shp')))
   def local(x,y,z=None):
    lon,lat=inverse.transform(x,y);return project(lon,lat)
   for f in reader.iterShapes(bbox=bbox):
    try:
     p=transform(local,shape(f.__geo_interface__))
     if not p.is_valid:p=p.buffer(0)
     polys=list(p.geoms)if p.geom_type=='MultiPolygon'else[p]
     for part,p in enumerate(polys):
      if p.geom_type!='Polygon' or p.area<12:continue
      q=p.representative_point()
      if abs(q.x)>30350 or abs(q.y)>30350:continue
      hits=osm_tree.query(p,predicate='intersects')
      if any(p.intersection(osm[int(i)][2]).area>min(p.area,osm[int(i)][2].area)*.30 for i in hits):duplicate+=1;continue
      oid='eab/'+str(city_index*10000000+f.oid)+('/'+str(part)if part else'');emit(oid,p)
    except (ValueError,TypeError,OverflowError):continue
   print('finished',city,'candidates',count,flush=True)
else:
 previous=json.loads(OUT.with_suffix('.json').read_text());duplicate=previous['deduplicated'];cells={};height_hints=collections.defaultdict(list);count=0;counts=collections.Counter()
 for line in RAW.open():
  oid,h,source,seed,rgb,rings,area,cx,cz,use,tag=json.loads(line);cell=(math.floor(cx/400),math.floor(cz/400));summary=cells.setdefault(cell,[0,0]);summary[0]+=1;summary[1]+=area
  if h is not None:height_hints[cell].append(h)
  count+=1;counts['eab'if oid.startswith('eab/')else'osm']+=1
digest=hashlib.sha256();height_counts=[0,0,0];kind_counts=[0,0,0];sampler=RoofSampler(CACHE/'sentinel-2025-09-16-visual.tif',unproject);rejected=0;examples=[];blue_examples=[];accepted=collections.Counter();processed=0;candidate_count=count
with RAW.open()as raw,OUT.open('w')as out:
 for line in raw:
  oid,h,source,seed,rgb,rings,area,cx,cz,use,tag=json.loads(line);cell=(math.floor(cx/400),math.floor(cz/400));num,total=cells[cell];mean_area=total/max(1,num);hints=height_hints.get(cell,[]);hint=float(np.median(hints))if hints else None;r=(seed%1000)/1000
  industrial=tag in{'industrial','warehouse','hangar','manufacture','storage_tank'}or use=='industrial'and area>250 or area>2400
  apartment=tag in{'apartments','dormitory','office','commercial','hotel'}or not industrial and area>250 and(hint is not None and hint>=20 or use in{'commercial','retail'}or mean_area>320 and num>=8)
  kind=1 if industrial else 2 if apartment else 0
  if h is None:
   if kind==1:h=7.5+r*5
   elif kind==2:
    h=min(110,max(15,hint*(.9+r*.2)))if hint is not None and hint>15 else(6+seed%6)*3.1 if mean_area<450 else(12+seed%10)*3.1
   else:h=3.2 if area<60 else(2+seed%2)*3.1+1.1
   # Neighbourhoods immediately around this airport are mostly villages and
   # logistics. Only missing-height estimates use this regional prior; tagged
   # heights remain intact and no runway-specific collision exemption exists.
   if math.hypot(cx,cz+1800)<5000:h=min(h,18)
  if h>=18 and kind==0:kind=2
  warm=(seed%9-4)*.9;wall=[round(min(225,max(100,rgb[k]*.16+[183+warm,181+warm,173+warm][k]*.84)))for k in range(3)]
  rgb,stale,evidence=sampler.sample(rings)
  if stale and oid.startswith('eab/'):
   rejected+=1
   if len(examples)<24:examples.append({'id':oid,'x':cx,'z':cz,'evidence':evidence})
   continue
  if oid.startswith('eab/') and rgb[2]>rgb[0]*1.4 and rgb[2]>rgb[1]*1.12 and area>800 and len(blue_examples)<12:blue_examples.append({'id':oid,'rgb':rgb,'x':cx,'z':cz})
  accepted['eab'if oid.startswith('eab/')else'osm']+=1;processed+=1
  if processed%50000==0:print('native roof samples',processed,'vegetation exclusions',rejected,'seconds',round(time.time()-started,1),flush=True)
  record=[oid,round(h,2),kind,source,seed,rgb,wall,rings];line=json.dumps(record,separators=(',',':'))+'\n';out.write(line);digest.update(line.encode());height_counts[source]+=1;kind_counts[kind]+=1
count=processed
meta={'assetVersion':2,'appearance':{'version':2,'coordinatePolicy':'Original source coordinates, heights and topology remain unchanged for every retained building; no global translation or GCJ02 adjustment.','roofSampling':'Footprint-weighted native 10 m Sentinel-2 RGB, courtyard exclusion, blue/red panel preservation, shadow/vegetation rejection.','stalePolicy':'EAB-only estimate exclusion when footprint vegetation >= 92% and its 50 m native-raster context >= 88%. OSM footprints are retained. This is visual evidence, not verified demolition.','candidateBuildings':candidate_count,'vegetationExcluded':rejected,'excludedExamples':examples,'blueRoofExamples':blue_examples},'buildings':count,'deduplicated':duplicate,'sourceSha256':digest.hexdigest(),'selection':'all eligible source footprints across the 60 km terrain, with OSM priority and native-image vegetation agreement screening for estimated EAB outlines; no cell sampling','terrainBounds':[-30000,-30000,30000,30000],'heightSources':height_counts,'buildingTypes':kind_counts,'provenance':{'footprints':json.loads((CACHE/'footprint-provenance.json').read_text()),'imagery':json.loads((CACHE/'satellite-provenance.json').read_text()),'osm':{'source':'https://download.geofabrik.de/asia/china/zhejiang/zhejiang-261119.osm.pbf','sha256':hashlib.file_digest(PBF.open('rb'),'sha256').hexdigest(),'snapshot':'2026-11-19','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors / ODbL'}},'sourceCounts':dict(accepted),'architecture':{'region':'Hangzhou / Xiaoshan','flatTemplateMaxHeight':120,'heightInference':'OSM height/floors first; otherwise stable neighbourhood/type/area estimates. Near-airport village/logistics prior applies only to missing heights. Not surveyed heights.'}}
OUT.with_suffix('.json').write_text(json.dumps(meta,indent=2));print('completed',json.dumps({k:v for k,v in meta.items()if k!='provenance'}),'seconds',round(time.time()-started,1),flush=True)
