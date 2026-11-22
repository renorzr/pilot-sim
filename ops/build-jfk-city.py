#!/usr/bin/env python3
"""Extract full regional OSM building footprints for offline New York / JFK scenery.

Geometry remains source-derived. Missing heights/type/colours use stable local
neighbourhood estimates; these are not surveyed heights or photographic facades.
"""
import collections,hashlib,json,math,pathlib,re,time,pickle,sys
import numpy as np,osmium
from city_roof_sampling_fast import FastRoofSampler as RoofSampler
from PIL import Image
from shapely.geometry import Polygon,Point,LineString,shape
from shapely.geometry.polygon import orient
from shapely.ops import transform
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-jfk-city');OUT=CACHE/'buildings.jsonl';RAW=CACHE/'building-candidates.jsonl';started=time.time()
airport=json.loads((ROOT/'game/src/airports/data/jfk.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='22R'for e in r['ends']));a=next(e for e in ends if e['id']=='22R');b=next(e for e in ends if e['id']!='22R');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def project(lon,lat):
 e=(np.asarray(lon)-a['longitude'])*east;n=(np.asarray(lat)-a['latitude'])*north
 return e*co-n*si,-e*si-n*co
def unproject(x,z):return a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north
def polygon(coords,holes=[]):
 p=Polygon([project(*q)for q in coords],[[project(*q)for q in h]for h in holes]);return p if p.is_valid else p.buffer(0)
perimeters=[polygon(f['geometry'],f.get('holes',[]))for f in airport['osm']['features']if f['tags'].get('aeroway')=='aerodrome'];excluded=STRtree(perimeters)
PBFS=[pathlib.Path('/tmp/pilot-sim-jfk-data/new-york-261120.osm.pbf'),CACHE/'new-jersey-261120.osm.pbf']
if '--from-candidates' not in sys.argv:
 context=CACHE/'osm-context.pickle'
 if context.exists():
  with context.open('rb')as f:water,roads,land,landtags,osm=pickle.load(f)
 else:
  water=[];roads=[];land=[];landtags=[];osm=[];seen=set()
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
   if t.get('location')=='underground' or t.get('building')=='construction':return
   if t.get('building')and t['building']not in{'no','construction','ruins','roof','greenhouse','carport','shed','sty','bunker','bridge','pavilion','gatehouse'}and oid not in seen:
    if p.area<12 or p.area>180000 or excluded.query(p.representative_point(),predicate='intersects').size:return
    seen.add(oid);osm.append((oid,t,p))
  for pbf in PBFS:
   processor=osmium.FileProcessor(str(pbf)).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY|osmium.osm.AREA)).with_filter(osmium.filter.KeyFilter('building','landuse','natural','water','waterway','highway'))
   for o in processor:
    try:
     if o.is_way():add_osm('way/'+str(o.id),dict(o.tags),[(n.lon,n.lat)for n in o.nodes])
     elif not o.from_way():
      for ix,r in enumerate(o.outer_rings()):add_osm('relation/'+str(o.orig_id())+('/'+str(ix)if ix else''),dict(o.tags),[(n.lon,n.lat)for n in r],[[(n.lon,n.lat)for n in h]for h in o.inner_rings(r)])
    except (RuntimeError,ValueError):pass
   print('extracted',pbf.name,'candidates',len(osm),flush=True)
  print('OSM context',len(osm),'buildings',len(water),'water',len(land),'landuse',len(roads),'roads','seconds',round(time.time()-started,1),flush=True)
  with context.open('wb')as f:pickle.dump((water,roads,land,landtags,osm),f)
 if '--context-only' in sys.argv:sys.exit()
 water_tree=STRtree(water);road_tree=STRtree(roads);land_tree=STRtree(land);cells={};height_hints=collections.defaultdict(list)
else:
 cells={};height_hints=collections.defaultdict(list)
# Colour working COGs retain source geometry at 1.2–2.4 m; source acquisition is
# 0.6 m. Match the deterministic mosaic priority when state strips overlap.
class CityRoofSampler:
 def __init__(self):
  self.items=json.loads((CACHE/'imagery-provenance.json').read_text())['items'];self.cache=collections.OrderedDict()
  from shapely.geometry import box
  self.tree=STRtree([box(i['bbox'][0],i['bbox'][1],i['bbox'][2],i['bbox'][3])for i in self.items])
 def index(self,cx,cz):
  lon,lat=unproject(cx,cz);hits=self.tree.query(Point(lon,lat),predicate='intersects');return int(max(hits))if len(hits)else -1
 def sample(self,rings,cx,cz,index=None):
  index=self.index(cx,cz)if index is None else index
  if index<0:return[155,151,141]
  item=self.items[index]
  if index not in self.cache:
   self.cache[index]=RoofSampler(CACHE/'cogs'/item['workingFile'],unproject,min_brightness=18,vegetation_screen=False)
   while len(self.cache)>3:self.cache.popitem(last=False)
  sampler=self.cache.pop(index);self.cache[index]=sampler
  return sampler.sample(rings)[0]
def seed_for(s):
 h=2166136261
 for c in s:h=((h^ord(c))*16777619)&0xffffffff
 return h
def tagged_height(t):
 try:
  text=t.get('height','');v=float(re.match(r'\s*([0-9.]+)',text).group(1))*(.3048 if 'ft'in text or "'"in text else 1)
  if 2<=v<=650:return round(v,2),0
 except Exception:pass
 try:
  v=float(t['building:levels'])*3.1
  if 2<=v<=650:return round(v,2),1
 except Exception:pass
 return None,2
if '--from-candidates' not in sys.argv:
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
   seed=seed_for(oid);rgb=[0,0,0];rings=[[[round(x,2),round(z,2)]for x,z in r.coords[:-1]]for r in[p.exterior,*p.interiors]]
   raw.write(json.dumps([oid,h,source,seed,rgb,rings,round(p.area,2),round(cx,2),round(cz,2),use,t.get('building',''),t.get('roof:shape','')],separators=(',',':'))+'\n');count+=1;counts['osm'if not oid.startswith('eab/')else'eab']+=1
   if count%50000==0:print('city candidates',count,'seconds',round(time.time()-started,1),flush=True)
  for oid,t,p in osm:emit(oid,p,t)
else:
 count=0;counts=collections.Counter();duplicate=0
 for line in RAW.open():
  oid,h,source,seed,rgb,rings,area,cx,cz,use,tag,roof_shape=json.loads(line);cell=(math.floor(cx/400),math.floor(cz/400));summary=cells.setdefault(cell,[0,0]);summary[0]+=1;summary[1]+=area
  if h is not None:height_hints[cell].append(h)
  count+=1;counts['osm']+=1
# Raw extraction has finished; colour sampling needs only cell statistics.
for name in ['water','roads','land','landtags','osm','water_tree','road_tree','land_tree']:globals().pop(name,None)
import gc;gc.collect()
height_medians={k:float(np.median(v))for k,v in height_hints.items()if v}
digest=hashlib.sha256();height_counts=[0,0,0];kind_counts=[0,0,0];sampler=CityRoofSampler()
# Spatial grouping makes each working COG load once instead of thrashing a
# small cache when source IDs jump across the city. Footprint/colour semantics
# are unchanged; the later packer independently orders spatial output chunks.
bucket_dir=CACHE/'roof-buckets';bucket_dir.mkdir(exist_ok=True)
handles={}
if '--from-buckets' in sys.argv:
 handles={int(p.stem.split('-')[-1]):None for p in bucket_dir.glob('bucket-*.jsonl')};assert handles
else:
 for p in bucket_dir.glob('bucket-*.jsonl'):p.unlink()
 for line in RAW.open():
  r=json.loads(line);index=sampler.index(r[7],r[8])
  if index not in handles:handles[index]=(bucket_dir/('bucket-'+str(index)+'.jsonl')).open('w')
  handles[index].write(line)
 for f in handles.values():f.close()
print('spatial colour buckets',len(handles),'seconds',round(time.time()-started,1),flush=True)
def rows():
 for index in sorted(handles):
  for line in (bucket_dir/('bucket-'+str(index)+'.jsonl')).open():yield index,line
resume=0
if '--resume-colours' in sys.argv and OUT.exists():
 good=0
 with OUT.open('r+b')as previous:
  for line in previous:
   if not line.endswith(b'\n'):break
   r=json.loads(line);digest.update(line);height_counts[r[3]]+=1;kind_counts[r[2]]+=1;resume+=1;good+=len(line)
  previous.truncate(good)
 assert resume<=count
 print('retained completed roof samples',resume,flush=True)
with OUT.open('a'if resume else'w')as out:
 for row_number,(source_index,line)in enumerate(rows()):
  if row_number<resume:continue
  oid,h,source,seed,rgb,rings,area,cx,cz,use,tag,roof_shape=json.loads(line);cell=(math.floor(cx/400),math.floor(cz/400));num,total=cells[cell];mean_area=total/max(1,num);hint=height_medians.get(cell);r=(seed%1000)/1000
  industrial=tag in{'industrial','warehouse','hangar','manufacture','storage_tank'}or use=='industrial'and area>250
  apartment=tag in{'apartments','dormitory','office','commercial','hotel','retail'}or not industrial and area>300 and(hint is not None and hint>=20 or use in{'commercial','retail'}or use=='residential' and mean_area>320 and num>=5)
  kind=1 if industrial else 2 if apartment else 0
  if h is None:
   if kind==1:h=8+r*6
   elif kind==2:
    h=min(180,max(10,hint*(.94+r*.12)))if hint is not None and hint>12 else (3+seed%3)*3.1 if area<300 else (4+seed_for(str(cell))%5)*3.1+(seed%3)*.3
   else:h=3.0 if area<45 else(2+seed%2)*3.05+.8
  if h>=18 and kind==0:kind=2
  # Coherent Queens/Brooklyn brick, stone and siding; source roofs use actual
  # footprint-weighted aerial pixels instead of neighbourhood background.
  palette=[[151,118,95],[167,146,119],[187,173,149],[150,147,137],[163,132,109],[175,163,143]]
  base=palette[seed_for(str((math.floor(cx/250),math.floor(cz/250))))%len(palette)]
  if kind==1:base=[173,174,165]
  elif kind==2 and h>150:base=[[171,181,185],[183,181,172],[159,172,177]][seed%3]
  wall=[round(min(226,max(95,base[k]+(seed%9-4)*1.2)))for k in range(3)]
  rgb=sampler.sample(rings,cx,cz,index=source_index)
  if roof_shape in{'flat','gabled','hipped'}:seed=(seed//5)*5+{'flat':2,'gabled':0,'hipped':3}[roof_shape]
  if sum(height_counts)%50000==0:print('roof colours',sum(height_counts),'seconds',round(time.time()-started,1),flush=True)
  record=[oid,round(h,2),kind,source,seed,rgb,wall,rings];line=json.dumps(record,separators=(',',':'))+'\n';out.write(line);digest.update(line.encode());height_counts[source]+=1;kind_counts[kind]+=1
meta={'buildings':count,'deduplicated':duplicate,'sourceSha256':digest.hexdigest(),'sourceSnapshot':'OpenStreetMap / Geofabrik New York + New Jersey 2026-11-20','selection':'all eligible source buildings across the full 60 km terrain, including multipolygons/courtyards; airport, water and road exclusions; no sparse cell sampling','terrainBounds':[-30000,-30000,30000,30000],'heightSources':height_counts,'buildingTypes':kind_counts,'provenance':{'imagery':json.loads((CACHE/'imagery-provenance.json').read_text()),'osm':{'sources':json.loads((CACHE/'osm-provenance.json').read_text()),'snapshot':'2026-11-20','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors / ODbL'}},'sourceCounts':dict(counts),'architecture':{'region':'Queens / Brooklyn / New York metro','flatTemplateMaxHeight':180,'homeRoofStyles':['gable','gable','flat','hip','gable'],'facadePalette':[[151,118,95],[167,146,119],[187,173,149],[150,147,137],[163,132,109],[175,163,143]],'heightInference':'OSM height/floors first; missing values use stable neighbourhood/footprint/type estimates. Source high-rise heights retained up to 650 m, never capped to a house template. Not surveyed heights.'},'imagery':'USDA NAIP 2022 RGB, native 0.6 m; 1.2/2.4 m working pixels','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors / ODbL','colourMethod':'Footprint-weighted 1.2/2.4 m NAIP working RGB from native 0.6 m imagery, including courtyard exclusion and blue/red panel preservation; estimated regional facades'}
OUT.with_suffix('.json').write_text(json.dumps(meta,indent=2));print('completed',json.dumps({k:v for k,v in meta.items()if k!='provenance'}),'seconds',round(time.time()-started,1),flush=True)
