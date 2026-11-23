#!/usr/bin/env python3
"""Extract full regional OSM building footprints for offline Osaka Bay / Kansai scenery.

Geometry remains source-derived. Missing heights/type/colours use stable local
neighbourhood estimates; these are not surveyed heights or photographic facades.
"""
import collections,hashlib,json,math,pathlib,re,time,pickle,sys,gzip
import numpy as np,osmium
from PIL import Image
from city_roof_sampling_fast import FastRoofSampler
from city_roof_sampling import RoofSampler
from shapely.geometry import Polygon,Point,LineString,shape
from shapely.geometry.polygon import orient
from shapely.ops import transform
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-kansai-city');OUT=CACHE/'buildings.jsonl';RAW=CACHE/'building-candidates.jsonl';started=time.time()
airport=json.loads((ROOT/'game/src/airports/data/kansai.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='06R'for e in r['ends']));a=next(e for e in ends if e['id']=='06R');b=next(e for e in ends if e['id']!='06R');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def project(lon,lat):
 if isinstance(lon,(int,float))and isinstance(lat,(int,float)):
  e=(lon-a['longitude'])*east;n=(lat-a['latitude'])*north
 else:e=(np.asarray(lon)-a['longitude'])*east;n=(np.asarray(lat)-a['latitude'])*north
 return e*co-n*si,-e*si-n*co
def unproject(x,z):return a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north
def polygon(coords,holes=[]):
 p=Polygon([project(*q)for q in coords],[[project(*q)for q in h]for h in holes]);return p if p.is_valid else p.buffer(0)
perimeters=[polygon(f['geometry'],f.get('holes',[]))for f in airport['osm']['features']if f['tags'].get('aeroway')=='aerodrome'];excluded=STRtree(perimeters)
PBF=pathlib.Path('/tmp/pilot-sim-kansai-data/kansai-261120.osm.pbf')
context=CACHE/'osm-context.pickle'
if context.exists():
 with context.open('rb')as f:water,roads,land,landtags,osm=pickle.load(f)
else:
 water=[];roads=[];land=[];landtags=[];osm=[];seen=set()
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
 for scanned,o in enumerate(processor,1):
  if scanned%100000==0:print('OSM scan',scanned,'regional buildings',len(osm),'seconds',round(time.time()-started,1),flush=True)
  try:
   if o.is_way():add_osm('way/'+str(o.id),dict(o.tags),[(n.lon,n.lat)for n in o.nodes])
   elif not o.from_way():
    for ix,r in enumerate(o.outer_rings()):add_osm('relation/'+str(o.orig_id())+('/'+str(ix)if ix else''),dict(o.tags),[(n.lon,n.lat)for n in r],[[(n.lon,n.lat)for n in h]for h in o.inner_rings(r)])
  except (RuntimeError,ValueError):pass
 print('OSM context',len(osm),'buildings',len(water),'water',len(land),'landuse',len(roads),'roads','seconds',round(time.time()-started,1),flush=True)
 with context.open('wb')as f:pickle.dump((water,roads,land,landtags,osm),f)
if '--context-only' in sys.argv:sys.exit()
water_tree=STRtree(water);road_tree=STRtree(roads);land_tree=STRtree(land);osm_tree=STRtree([p for _,_,p in osm]);cells={};height_hints=collections.defaultdict(list)
imagery_source=json.loads((CACHE/'imagery-provenance.json').read_text())
samplers=[(r['zoom'],FastRoofSampler(CACHE/r['file'],unproject,min_brightness=18,vegetation_screen=False))for r in imagery_source['workingRasters']]
colour_counts=collections.Counter()
def rgb_for(p,estimated=False):
 q=p.representative_point();rings=[list(r.coords)for r in[p.exterior,*p.interiors]]
 for zoom,sampler in reversed(samplers):
  lon,lat=unproject(q.x,q.y);mx,my=sampler.project(lon,lat);px,py=sampler.inverse*(mx,my);x,y=int(px),int(py)
  if not(0<=y<sampler.rgb.shape[0]and 0<=x<sampler.rgb.shape[1])or not np.any(sampler.rgb[y,x]):continue
  rgb=sampler.sample(rings)[0]
  if sum(rgb)<40:continue
  if colour_counts[str(zoom)]<16:assert rgb==RoofSampler.sample(sampler,rings)[0],('Native roof sampler disagreement',zoom)
  if estimated and rgb[1]>rgb[0]*1.12 and rgb[1]>rgb[2]*1.08 and rgb[1]>45:
   metric=RoofSampler.sample(sampler,rings)[2];context=float(sampler.green[max(0,y-2):y+3,max(0,x-2):x+3].mean())
   if metric['vegetation']>=.95 and context>=.90:return None
  colour_counts[str(zoom)]+=1;return rgb
 colour_counts['estimated']+=1;return[119,118,113]
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
count=0;counts=collections.Counter();duplicate=0;screened=0
with RAW.open('w')as raw:
 def emit(oid,p,t={}):
  global count,screened
  if t.get('location')=='underground'or t.get('tunnel')in{'yes','building_passage'}or t.get('building:levels','').startswith('-'):return
  if p.area<12 or p.area>180000:return
  p=orient(p.simplify(.25,preserve_topology=True),sign=-1);x0,z0,x1,z1=p.bounds
  if max(x1-x0,z1-z0)>700:return
  q=p.representative_point();cx,cz=q.x,q.y
  if abs(cx)>30350 or abs(cz)>30350 or excluded.query(q,predicate='intersects').size or water_tree.query(q,predicate='intersects').size or road_tree.query(q,predicate='intersects').size:return
  rgb=rgb_for(p,oid.startswith('ms/'))
  if rgb is None:screened+=1;return
  h,source=tagged_height(t);cell=(math.floor(cx/400),math.floor(cz/400));summary=cells.setdefault(cell,[0,0]);summary[0]+=1;summary[1]+=p.area
  if h is not None:height_hints[cell].append(h)
  use='';indexes=land_tree.query(q,predicate='intersects')
  if len(indexes):use=landtags[min(indexes,key=lambda i:land[i].area)]
  seed=seed_for(oid);rings=[[[round(x,2),round(z,2)]for x,z in r.coords[:-1]]for r in[p.exterior,*p.interiors]]
  raw.write(json.dumps([oid,h,source,seed,rgb,rings,round(p.area,2),round(cx,2),round(cz,2),use,t.get('building','')],separators=(',',':'))+'\n');count+=1;counts['ms'if oid.startswith('ms/')else'osm']+=1
  if count%50000==0:print('city candidates',count,'seconds',round(time.time()-started,1),flush=True)
 for oid,t,p in osm:emit(oid,p,t)
 ms_source=json.loads((CACHE/'ms-provenance.json').read_text());ms_seen=set()
 for item in ms_source['items']:
  quadkey=int(item['QuadKey']);scanned=0
  with gzip.open(CACHE/item['file'],'rt')as lines:
   for line_index,line in enumerate(lines,1):
    scanned+=1
    if line_index>=10000000:raise RuntimeError('Source-row ID bound exceeded')
    feature=json.loads(line);geometry=feature.get('geometry')or{};coordinates=geometry.get('coordinates')or[]
    if not coordinates:continue
    polygons=coordinates if geometry.get('type')=='MultiPolygon'else[coordinates]
    for part,rings in enumerate(polygons):
     if not rings or not rings[0]:continue
     x,z=project(*rings[0][0])
     if abs(x)>31000 or abs(z)>31000:continue
     try:p=polygon(rings[0],rings[1:])
     except (ValueError,RuntimeError):continue
     if p.geom_type!='Polygon'or p.is_empty or p.area<12:continue
     q=p.representative_point();indexes=osm_tree.query(p,predicate='intersects')
     if any(p.intersection(osm[i][2]).area>min(p.area,osm[i][2].area)*.25 for i in indexes):duplicate+=1;continue
     fingerprint=hashlib.sha1(p.normalize().wkb).digest()
     if fingerprint in ms_seen:duplicate+=1;continue
     ms_seen.add(fingerprint);oid='ms/'+str(quadkey*10000000+line_index)+('/'+str(part)if part else'');emit(oid,p)
    if scanned%100000==0:print('MS source rows',item['QuadKey'],scanned,'accepted',count,'seconds',round(time.time()-started,1),flush=True)
  print('MS partition ready',item['QuadKey'],scanned,'source rows',flush=True)

height_medians={cell:float(np.median(values))for cell,values in height_hints.items()};
digest=hashlib.sha256();height_counts=[0,0,0];kind_counts=[0,0,0]
with RAW.open()as raw,OUT.open('w')as out:
 for line in raw:
  oid,h,source,seed,rgb,rings,area,cx,cz,use,tag=json.loads(line);cell=(math.floor(cx/400),math.floor(cz/400));num,total=cells[cell];mean_area=total/max(1,num);hints=height_hints.get(cell,[]);hint=height_medians.get(cell);r=(seed%1000)/1000
  industrial=tag in{'industrial','warehouse','hangar','manufacture','factory','storage_tank'}or use=='industrial'and area>250
  apartment=tag in{'apartments','dormitory','office','commercial','hotel'}or not industrial and area>400 and(hint is not None and hint>=20 or use in{'commercial','retail'}or use=='residential' and mean_area>320 and num>=5)
  kind=1 if industrial else 2 if apartment else 0
  if h is None:
   if kind==1:h=8+r*6
   elif kind==2:
    h=min(100,max(12,hint*(.94+r*.12)))if hint is not None and hint>12 else (3+seed%3)*3.0 if (area<300 and tag not in{'apartments','dormitory'})or use=='retail' or tag=='retail' else (4+seed_for(str(cell))%5)*3.0+(seed%3)*.3
   else:h=3.2 if area<25 else(2+(seed%7==0))*2.9+.6
  if h>=18 and kind==0:kind=2
  # Cohesive estate palettes, small per-block variation, neutral logistics.
  palette=[[199,195,183],[183,186,182],[208,202,190],[173,180,183],[194,183,170],[188,191,181]]
  base=palette[seed_for(str((math.floor(cx/700),math.floor(cz/700))))%len(palette)]
  if kind==1:base=[177,185,183]
  wall=[round(min(226,max(118,base[k]+(seed%9-4)*1.2)))for k in range(3)]
  record=[oid,round(h,2),kind,source,seed,rgb,wall,rings];line=json.dumps(record,separators=(',',':'))+'\n';out.write(line);digest.update(line.encode());height_counts[source]+=1;kind_counts[kind]+=1
meta={'buildings':count,'deduplicated':duplicate,'conservativeVegetationExclusions':screened,'sourceSha256':digest.hexdigest(),'sourceSnapshot':'OpenStreetMap / Geofabrik 2026-11-20 plus pinned Microsoft Global ML Japan footprints','selection':'all eligible OSM plus non-overlapping Microsoft ML footprints across the full 60 km terrain, including residential multipolygons/courtyards; airport, road and water exclusions; no cell sampling','terrainBounds':[-30000,-30000,30000,30000],'heightSources':height_counts,'buildingTypes':kind_counts,'provenance':{'microsoft':{**ms_source,'licenseCopy':'assets/cities/kansai/MICROSOFT-LICENSE.txt'},'imagery':imagery_source,'osm':{'source':'https://download.geofabrik.de/asia/japan/kansai/kansai-261120.osm.pbf','sha256':hashlib.file_digest(PBF.open('rb'),'sha256').hexdigest(),'snapshot':'2026-11-20','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors / ODbL'}},'sourceCounts':dict(counts),'architecture':{'region':'Osaka Bay / Kansai coast','flatTemplateMaxHeight':140,'homeRoofStyles':['gable','hip','gable','flat','hip'],'facadePalette':[[199,195,183],[183,186,182],[208,202,190],[173,180,183],[194,183,170],[188,191,181]],'heightInference':'OSM height/floors first; missing values use stable local height hints and coherent Japanese low-house, mid-rise apartment or logistics estimates. Not surveyed heights.'},'imagery':'GSI seamlessphoto, tile pixels approximately 3.94 m regional / 1.97 m coastal / 0.99 m airport; photographic dates/resolution unspecified by source service','roofColourSamplesByZoom':dict(colour_counts),'license':'ODbL-1.0 combined database; CDLA-Permissive-2.0 Microsoft source retained','attribution':'© OpenStreetMap contributors / ODbL; Microsoft Global ML Building Footprints / CDLA Permissive 2.0','colourMethod':'Footprint-weighted photographic RGB at the finest available GSI tile level, retaining dark/blue/red roofs. No OSM footprint removed by colour screening. Only estimated Microsoft footprints with >=95% native-footprint vegetation and >=90% local vegetation are screened; this is a visual estimate, not verified demolition. Estimated coherent Japanese facade palette.'}
import shutil
shutil.copyfile(ROOT/'ops/assets/licenses/microsoft-global-buildings-LICENSE',ROOT/'public/assets/cities/kansai/MICROSOFT-LICENSE.txt')
OUT.with_suffix('.json').write_text(json.dumps(meta,indent=2));print('completed',json.dumps({k:v for k,v in meta.items()if k!='provenance'}),'seconds',round(time.time()-started,1),flush=True)
