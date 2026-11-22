#!/usr/bin/env python3
"""Offline ODbL footprint expansion; no fabricated positions or runtime API.

Uses the existing fingerprinted raw OSM cache and self-hosted NAIP files.
The intermediate lives in RAM/tmp, never in the application's JS bundle.
"""
import hashlib,json,math,pathlib,re,time
import ijson,numpy as np
from PIL import Image
from shapely.geometry import Polygon,Point
from shapely.geometry.polygon import orient
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1]
RAW=pathlib.Path('/tmp/pilot-sim-lax-city-data/city-features-raw.json')
OUT=pathlib.Path('/dev/shm/pilot-lax-dense-source.json')
airport=json.loads((ROOT/'game/src/airports/data/lax.json').read_text())
city=json.loads((ROOT/'game/src/airports/data/lax-city.json').read_text())
threshold=(-118.379794,33.939881);bearing=math.radians(262.97326664802347)
co,si=math.cos(bearing),math.sin(bearing);east_scale=6378137*math.pi/180*math.cos(math.radians(threshold[1]));north_scale=6378137*math.pi/180
def project(lon,lat):
 e=(lon-threshold[0])*east_scale;n=(lat-threshold[1])*north_scale
 return(e*co-n*si,-e*si-n*co)
def unproject(x,z):return(threshold[0]+(x*co-z*si)/east_scale,threshold[1]+(-x*si-z*co)/north_scale)
def shape(f):
 p=Polygon([project(*q)for q in f['geometry']],[[project(*q)for q in h]for h in f.get('holes',[])])
 return p if p.is_valid else p.buffer(0)
existing={f['id']for f in airport['osm']['features']}
exclusions=[]
for f in airport['osm']['features']:
 if f['id']=='way/649268639' or f['tags'].get('building'):
  try:
   p=shape(f)
   if not p.is_empty:exclusions.append(p)
  except Exception:pass
for f in [city['landmarks']['sofi'],city['landmarks']['forum'],*city['landmarks']['downtown']]:exclusions.append(shape(f).buffer(.3))
excluded=STRtree(exclusions)
manifest=json.loads((ROOT/'public/assets/cities/lax/imagery-lod.json').read_text())
images=[]
for rec in [manifest['regional'],manifest['overview'],*manifest['tiles']]:
 s,w,n,e=rec['bounds'];im=np.asarray(Image.open(ROOT/'public'/rec['path']).convert('RGB'))
 images.append(((e-w)/im.shape[1],(s,w,n,e),im))
images.sort(key=lambda r:r[0])
def sample(poly):
 q=poly.representative_point();lon,lat=unproject(q.x,q.y)
 for _,(s,w,n,e),im in images:
  if not(w<lon<e and s<lat<n):continue
  probes=[q,poly.centroid];x0,z0,x1,z1=poly.bounds
  probes.extend(Point(q.x+(x1-x0)*u,q.y+(z1-z0)*v)for u,v in[(-.18,0),(.18,0),(0,-.18),(0,.18),(-.12,-.12),(.12,.12)])
  colors=[]
  for p in probes:
   if not poly.covers(p):continue
   a,b=unproject(p.x,p.y)
   x=int((a-w)/(e-w)*im.shape[1]);y=int((n-b)/(n-s)*im.shape[0])
   if not(0<=x<im.shape[1]and 0<=y<im.shape[0]):continue
   r,g,bl=map(int,im[y,x]);lum=(r+g+bl)/3
   if lum<40 or g>r*1.18 or bl>r*1.4:continue
   colors.append([r,g,bl])
  if colors:return list(map(int,np.median(colors,axis=0)))
 return[158,153,142]
def seed_for(s):
 h=2166136261
 for c in s:h=((h^ord(c))*16777619)&0xffffffff
 return h
def height_and_kind(t,area,seed):
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
  source=2;r=(seed%1000)/1000
  h=(3.2 if area<70 else (1 if r<.6 else 2)*3.05+1.1)if kind==0 else 7+r*5 if kind==1 else (2+seed%3)*3.2
 return round(h,2),kind,source
start=time.time();rows=[];polys=[];seen=set()
with RAW.open('rb')as stream:
 for f in ijson.items(stream,'item',use_float=True):
  t=f['tags'];p=f['geometry']
  if not t.get('building')or len(p)<4 or f['id']in existing or f['id']in seen:continue
  lon=sum(q[0]for q in p)/len(p);lat=sum(q[1]for q in p)/len(p);x,z=project(lon,lat)
  if not(math.hypot(x,z+2000)<7500 or 0<z<23500 and abs(x)<2200 or -118.28<lon<-118.235 and 34.03<lat<34.075):continue
  try:
   poly=shape(f)
   if poly.geom_type!='Polygon' or poly.area<12 or poly.area>180000:continue
   if len(excluded.query(poly.representative_point(),predicate='intersects')):continue
   poly=orient(poly.simplify(.22,preserve_topology=True),sign=-1)
   if max(poly.bounds[2]-poly.bounds[0],poly.bounds[3]-poly.bounds[1])>700:continue
  except Exception:continue
  seed=seed_for(f['id']);h,kind,source=height_and_kind(t,poly.area,seed);rings=[[[round(a,2),round(b,2)]for a,b in r.coords[:-1]]for r in[poly.exterior,*poly.interiors]]
  rows.append([f['id'],h,kind,source,seed,rings]);polys.append(poly);seen.add(f['id'])
print('candidates',len(rows),'seconds',round(time.time()-start,1),flush=True)
tree=STRtree(polys);removed=set()
for i,p in enumerate(polys):
 if i in removed:continue
 for j in tree.query(p,predicate='intersects'):
  if j<=i or j in removed:continue
  q=polys[j]
  if min(p.area,q.area)/max(p.area,q.area)<.82:continue
  if p.intersection(q).area/max(p.area,q.area)>.88:removed.add(j)
result=[]
for i,row in enumerate(rows):
 if i in removed:continue
 rgb=sample(polys[i]);seed=row[4];warm=(seed%7-3)*1.3
 wall=[round(min(225,max(100,rgb[k]*.18+[180+warm,176+warm,165+warm][k]*.82)))for k in range(3)]
 result.append(row[:5]+[rgb,wall,row[5]])
result.sort(key=lambda r:r[0])
OUT.write_text(json.dumps({'sourceSha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'records':result,'deduplicated':len(removed),'selection':'all available source building footprints in7.5km airport radius,23.5km approach +/-2.2km and Downtown box; source-airport/landmark exclusions; no cell sampling'},separators=(',',':')))
print('selected',len(result),'deduplicated',len(removed),'intermediate',OUT.stat().st_size,'seconds',round(time.time()-start,1),flush=True)
