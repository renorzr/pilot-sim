#!/usr/bin/env python3
"""Expand source buildings over the full LAX terrain; offline optional rebuild.

The cached ODbL PBF is never shipped. Stream derived records to JSONL rather
than holding millions of Python polygons/JSON records in memory.
"""
import argparse, hashlib, json, math, pathlib, re, time
import osmium, numpy as np
from PIL import Image
from shapely.geometry import Polygon, Point
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser();args.add_argument('--pbf',default='/tmp/pilot-sim-lax-data/LosAngeles-2026-11-14.osm.pbf');args.add_argument('--output',default='/tmp/pilot-lax-regional-buildings.jsonl');a=args.parse_args()
threshold=(-118.379794,33.939881);bearing=math.radians(262.97326664802347);co,si=math.cos(bearing),math.sin(bearing);east=6378137*math.pi/180*math.cos(math.radians(threshold[1]));north=6378137*math.pi/180
def project(lon,lat):
 e=(lon-threshold[0])*east;n=(lat-threshold[1])*north
 return e*co-n*si,-e*si-n*co
def unproject(x,z):return threshold[0]+(x*co-z*si)/east,threshold[1]+(-x*si-z*co)/north
airport=json.loads((ROOT/'game/src/airports/data/lax.json').read_text());city=json.loads((ROOT/'game/src/airports/data/lax-city.json').read_text())
existing={f['id'] for f in airport['osm']['features']};exclusions=[]
for f in [*airport['osm']['features'],city['landmarks']['sofi'],city['landmarks']['forum'],*city['landmarks']['downtown']]:
 if not (f['id']=='way/649268639' or f.get('tags',{}).get('building') or f in city['landmarks']['downtown']):continue
 try:
  p=Polygon([project(*q)for q in f['geometry']],[[project(*q)for q in h]for h in f.get('holes',[])])
  if not p.is_valid:p=p.buffer(0)
  if not p.is_empty:exclusions.append(p.buffer(.3))
 except Exception:pass
excluded=STRtree(exclusions)
imagery=json.loads((ROOT/'public/assets/cities/lax/imagery-lod.json').read_text());images=[]
for rec in [imagery['regional'],imagery['overview'],*imagery['tiles']]:
 im=np.asarray(Image.open(ROOT/'public'/rec['path']).convert('RGB'));images.append(((rec['bounds'][3]-rec['bounds'][1])/im.shape[1],rec['bounds'],im))
images.sort(key=lambda r:r[0])
def sample(poly):
 p=poly.representative_point();lon,lat=unproject(p.x,p.y)
 for _,(s,w,n,e),im in images:
  if not(w<lon<e and s<lat<n):continue
  px=int((lon-w)/(e-w)*im.shape[1]);py=int((n-lat)/(n-s)*im.shape[0]);colors=[]
  for dx,dy in [(0,0),(-1,0),(1,0),(0,-1),(0,1)]:
   x=min(im.shape[1]-1,max(0,px+dx));y=min(im.shape[0]-1,max(0,py+dy));r,g,b=map(int,im[y,x])
   if (r+g+b)/3>=40 and g<=r*1.18 and b<=r*1.4:colors.append((r,g,b))
  if colors:return list(map(int,np.median(colors,axis=0)))
 return [158,153,142]
def seed_for(s):
 h=2166136261
 for c in s:h=((h^ord(c))*16777619)&0xffffffff
 return h
def height_kind(t,area,seed):
 kind=0 if t.get('building')in{'house','detached','residential','apartments','bungalow','terrace','semidetached_house','garage','garages'}else 1 if t.get('building')in{'industrial','warehouse','hangar','manufacture','storage_tank'}else 2
 h=None;source=0
 try:
  text=t.get('height','');h=float(re.match(r'\s*([0-9.]+)',text).group(1))*(.3048 if 'ft'in text or "'"in text else 1)
 except Exception:pass
 if h is None or not 2<=h<=400:
  try:h=float(t['building:levels'])*3.15;source=1
  except Exception:h=None
 if kind==2 and area<350 and(h is None or h<12):kind=0
 if kind==2 and area>1800 and(h is None or h<15):kind=1
 if h is None or not 2<=h<=400:
  source=2;r=(seed%1000)/1000;h=(3.2 if area<70 else (1 if r<.6 else 2)*3.05+1.1)if kind==0 else 7+r*5 if kind==1 else (2+seed%3)*3.2
 return round(h,2),kind,source
out=pathlib.Path(a.output);seen=set();count=0;dedup=0;started=time.time();digest=hashlib.sha256();tile_polys={}
with out.open('w')as stream:
 def emit(oid,t,coords,holes):
  global count,dedup
  if oid in existing or oid in seen or len(coords)<4:return
  # Reject before allocating a polygon. Match the entire 60 km terrain, not
  # a narrow airport/approach strip. Real oceans/parks get no invented houses.
  x,z=project(*coords[0])
  if abs(x)>30350 or abs(z)>30350:return
  p=Polygon([project(*q)for q in coords],[[project(*q)for q in h]for h in holes])
  if not p.is_valid:p=p.buffer(0)
  if p.geom_type!='Polygon' or not 12<=p.area<=180000:return
  if excluded.query(p.representative_point(),predicate='intersects').size:return
  p=orient(p.simplify(.22,preserve_topology=True),sign=-1);x0,z0,x1,z1=p.bounds
  if max(x1-x0,z1-z0)>700:return
  # Relations can duplicate closed ways. Nearby exact geometry keys avoid
  # keeping a second full Shapely database merely for duplicate detection.
  key=(round(p.centroid.x,1),round(p.centroid.y,1),round(p.area,1))
  bucket=tile_polys.setdefault((math.floor(p.centroid.x/1500),math.floor(p.centroid.y/1500)),set())
  if key in bucket:dedup+=1;return
  bucket.add(key);seen.add(oid);seed=seed_for(oid);h,kind,source=height_kind(t,p.area,seed);rgb=sample(p);warm=(seed%7-3)*1.3;wall=[round(min(225,max(100,rgb[k]*.18+[180+warm,176+warm,165+warm][k]*.82)))for k in range(3)]
  rings=[[[round(x,2),round(z,2)]for x,z in r.coords[:-1]]for r in[p.exterior,*p.interiors]]
  line=json.dumps([oid,h,kind,source,seed,rgb,wall,rings],separators=(',',':'))+'\n';stream.write(line);digest.update(line.encode());count+=1
  if count%100000==0:print('regional source buildings',count,'seconds',round(time.time()-started,1),flush=True)
 processor=osmium.FileProcessor(a.pbf).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY|osmium.osm.AREA)).with_filter(osmium.filter.KeyFilter('building'))
 for o in processor:
  try:
   t=dict(o.tags)
   if not t.get('building'):continue
   if o.is_way():
    if len(o.nodes)<4 or o.nodes[0].ref!=o.nodes[-1].ref:continue
    emit('way/'+str(o.id),t,[(n.lon,n.lat)for n in o.nodes],[])
   elif not o.from_way():
    for ix,ring in enumerate(o.outer_rings()):emit('relation/'+str(o.orig_id())+('/'+str(ix)if ix else''),t,[(n.lon,n.lat)for n in ring],[[(n.lon,n.lat)for n in h]for h in o.inner_rings(ring)])
  except (RuntimeError,ValueError,OverflowError):continue
meta={'sourceSha256':digest.hexdigest(),'sourcePbfSha256':hashlib.file_digest(open(a.pbf,'rb'),'sha256').hexdigest(),'buildings':count,'deduplicated':dedup,'selection':'all available source building footprints across the full 60km LAX terrain (+350m crossing-footprint margin); airport/landmark exclusions; no cell sampling','terrainBounds':[-30000,-30000,30000,30000]}
out.with_suffix('.json').write_text(json.dumps(meta,indent=2));print(json.dumps(meta),'seconds',round(time.time()-started,1),flush=True)
