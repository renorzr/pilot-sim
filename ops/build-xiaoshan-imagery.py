#!/usr/bin/env python3
"""Create georeferenced, self-hosted Sentinel-2 RGB levels (native 10 m)."""
import hashlib,json,math,pathlib
import numpy as np,rasterio
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-xiaoshan-city');DEST=ROOT/'public/assets/cities/xiaoshan';DEST.mkdir(parents=True,exist_ok=True)
airport=json.loads((ROOT/'game/src/airports/data/xiaoshan.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='07'for e in r['ends']));a=next(e for e in ends if e['id']=='07');b=next(e for e in ends if e['id']!='07');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def unproject(x,z):return(a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north)
def bounds(x0,z0,x1,z1):
 p=[unproject(x,z)for x,z in[(x0,z0),(x0,z1),(x1,z0),(x1,z1)]]
 return[min(p[1]for p in p),min(p[0]for p in p),max(p[1]for p in p),max(p[0]for p in p)]
def write(src,name,b,size):
 path=DEST/(name+'.webp');s,w,n,e=b;arr=np.zeros((3,size,size),dtype='uint8')
 if not path.exists():
  reproject(source=rasterio.band(src,[1,2,3]),destination=arr,src_transform=src.transform,src_crs=src.crs,dst_transform=from_bounds(w,s,e,n,size,size),dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=2)
  if np.mean(np.any(arr>0,axis=0))<.995:raise RuntimeError('Satellite does not cover requested terrain')
  rgb=np.moveaxis(arr,0,-1);Image.fromarray(rgb).save(path,'WEBP',quality=91,method=6)
 else:rgb=np.array(Image.open(path).convert('RGB'))
 return{'id':name,'path':'assets/cities/xiaoshan/'+path.name,'bounds':b,'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
with rasterio.open(CACHE/'sentinel-2025-09-16-visual.tif')as src:
 full=bounds(-30500,-30500,30500,30500);regional=write(src,'s2-regional-v1',full,2048);overview=write(src,'s2-overview-v1',full,4096);tiles=[]
 for i,x in enumerate([-20000,-10000,0,10000]):
  for j,z in enumerate([-20000,-10000,0,10000,20000]):
   r=write(src,f's2-detail-v1-{i}-{j}',bounds(x,z,x+10000,z+10000),1024);tiles.append(r);print('imagery',r['id'],r['bytes'],flush=True)
source=json.loads((CACHE/'satellite-provenance.json').read_text());manifest={'version':1,'airportId':'xiaoshan','label':'Copernicus Sentinel-2 · 2025-09-16 · 10 m','sourceNativeGsdM':10,'captureDates':[source['datetime']],'projection':'EPSG:4326 north-up; bounds south,west,north,east','regional':regional,'overview':overview,'tiles':tiles,'roofProjectionOpacity':.15,'source':source,'processing':'Native 10 m RGB true-colour COG; bilinear reprojection into local georeferenced WebPs. This is satellite imagery, not sub-metre aerial photography. Larger overview levels improve sampling continuity, not source resolution. All pixels derive from the dated Sentinel acquisition.'};(DEST/'imagery-v1.json').write_text(json.dumps(manifest,separators=(',',':')));print('imagery pack bytes',sum(r['bytes']for r in[regional,overview,*tiles]),flush=True)
