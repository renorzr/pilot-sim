#!/usr/bin/env python3
"""Self-hosted georeferenced 10 m Sentinel-2 mosaic, cloud/shadow screened.

Use dated TCI pixels only. SCL classification plus a 100 m cloud-edge margin
reject clouds/shadows. Average valid acquisitions to soften baked illumination;
source gaps use the least-cloudy observed pixel, never synthetic map pixels.
"""
import hashlib,json,math,pathlib
import numpy as np,rasterio
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds
from rasterio.features import rasterize
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-changi-city');DEST=ROOT/'public/assets/cities/changi';DEST.mkdir(parents=True,exist_ok=True)
airport=json.loads((ROOT/'game/src/airports/data/changi.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='02L'for e in r['ends']));a=next(e for e in ends if e['id']=='02L');b=next(e for e in ends if e['id']!='02L');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def unproject(x,z):return(a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north)
def bounds(x0,z0,x1,z1):
 p=[unproject(x,z)for x,z in[(x0,z0),(x0,z1),(x1,z0),(x1,z1)]]
 return[min(p[1]for p in p),min(p[0]for p in p),max(p[1]for p in p),max(p[0]for p in p)]
def dilate(mask,radius=10):
 # Separable Boolean max filter avoids a quadratic raster neighbourhood pass.
 rows=np.pad(mask,((0,0),(radius,radius)),mode='edge');horizontal=np.zeros_like(mask)
 for shift in range(radius*2+1):horizontal|=rows[:,shift:shift+mask.shape[1]]
 columns=np.pad(horizontal,((radius,radius),(0,0)),mode='edge');result=np.zeros_like(mask)
 for shift in range(radius*2+1):result|=columns[shift:shift+mask.shape[0],:]
 return result
full=bounds(-30500,-30500,30500,30500);south,west,north_,east_=full;size=8192;tx=from_bounds(west,south,east_,north_,size,size);source=json.loads((CACHE/'satellite-provenance.json').read_text());mosaic=CACHE/'sentinel-cloud-screened.tif'
if not mosaic.exists():
 total=np.zeros((3,size,size),dtype='uint16');count=np.zeros((size,size),dtype='uint8');best=np.full((size,size),65535,dtype='uint16');fallback=np.zeros((3,size,size),dtype='uint8')
 for record in source['items']:
  rgb=np.zeros((3,size,size),dtype='uint8');scl=np.zeros((size,size),dtype='uint8')
  with rasterio.open(CACHE/record['assets']['visual']['file'])as src:reproject(source=rasterio.band(src,[1,2,3]),destination=rgb,src_transform=src.transform,src_crs=src.crs,dst_transform=tx,dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=2)
  with rasterio.open(CACHE/record['assets']['SCL']['file'])as src:reproject(source=rasterio.band(src,1),destination=scl,src_transform=src.transform,src_crs=src.crs,dst_transform=tx,dst_crs='EPSG:4326',resampling=Resampling.nearest,src_nodata=0,dst_nodata=0,num_threads=2)
  exists=np.any(rgb>0,axis=0);bad=~np.isin(scl,[2,4,5,6,7]);bad=dilate(bad);valid=exists&~bad
  # Chunk updates bound temporary-array memory during a reproducible rebuild.
  for y in range(0,size,512):
   v=valid[y:y+512];total[:,y:y+512]+=rgb[:,y:y+512]*v;count[y:y+512]+=v
   score=(bad[y:y+512].astype('uint16')*1000+rgb[:,y:y+512].astype('uint16').sum(axis=0));better=exists[y:y+512]&(score<best[y:y+512]);fallback[:,y:y+512]=np.where(better,rgb[:,y:y+512],fallback[:,y:y+512]);best[y:y+512]=np.where(better,score,best[y:y+512])
  print('composited',record['itemId'],'clear grid',round(float(np.mean(valid)),4),flush=True)
  del rgb,scl,exists,bad,valid
 result=np.zeros((3,size,size),dtype='uint8')
 for y in range(0,size,512):result[:,y:y+512]=np.where(count[y:y+512]>0,np.round(total[:,y:y+512]/np.maximum(count[y:y+512],1)),fallback[:,y:y+512])
 if np.mean(np.any(result>0,axis=0))<.999:raise RuntimeError('Insufficient source coverage')
 stats={'coveredPixelFraction':float(np.mean(np.any(result>0,axis=0))),'clearPixelFraction':float(np.mean(count>0)),'clearAcquisitionMean':float(np.mean(count)),'pixelSelection':'SCL 2/4/5/6/7 with 100 m cloud/shadow-edge exclusion; mean of valid acquisitions; least-bright observed fallback only when all dates invalid'}
 (CACHE/'mosaic-stats.json').write_text(json.dumps(stats,indent=2))
 with rasterio.open(mosaic,'w',driver='GTiff',width=size,height=size,count=3,dtype='uint8',crs='EPSG:4326',transform=tx,compress='deflate',tiled=True)as out:out.write(result)
 del total,count,best,fallback,result

def write(src,name,b,size):
 path=DEST/(name+'.webp');s,w,n,e=b;arr=np.zeros((3,size,size),dtype='uint8')
 reproject(source=rasterio.band(src,[1,2,3]),destination=arr,src_transform=src.transform,src_crs=src.crs,dst_transform=from_bounds(w,s,e,n,size,size),dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=2)
 if np.mean(np.any(arr>0,axis=0))<.995:raise RuntimeError('Satellite does not cover terrain')
 Image.fromarray(np.moveaxis(arr,0,-1)).save(path,'WEBP',quality=91,method=6)
 return {'id':name,'path':'assets/cities/changi/'+path.name,'bounds':b,'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
def mask(record,name):
 s,w,n,e=record['bounds'];size=record['width'];shapes=[]
 for f in airport['osm']['features']:
  if f['tags'].get('water')=='sea':shapes.append(({'type':'Polygon','coordinates':[f['geometry'],*f.get('holes',[])]},255))
 arr=rasterize(shapes,out_shape=(size,size),transform=from_bounds(w,s,e,n,size,size),fill=0,dtype='uint8');path=DEST/(name+'.png');Image.fromarray(arr).save(path)
 return {'path':'assets/cities/changi/'+path.name,'bounds':record['bounds'],'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
with rasterio.open(mosaic)as src:
 regional=write(src,'s2-regional-v1',full,2048);overview=write(src,'s2-overview-v1',full,4096);tiles=[]
 for i,x in enumerate([-30000,-20000,-10000,0,10000,20000]):
  for j,z in enumerate([-30000,-20000,-10000,0,10000,20000]):
   r=write(src,f's2-detail-v1-{i}-{j}',bounds(x,z,x+10000,z+10000),1024);tiles.append(r);print('imagery',r['id'],r['bytes'],flush=True)
manifest={'version':1,'airportId':'changi','label':'Copernicus Sentinel-2 · 2025–2026 composite · 10 m','sourceNativeGsdM':10,'captureDates':sorted(set(i['datetime']for i in source['items'])),'projection':'EPSG:4326 north-up; bounds south,west,north,east','regional':regional,'overview':overview,'tiles':tiles,'seaMask':mask(overview,'sea-mask-v1'),'coastMask':mask(regional,'coast-mask-v1'),'roofProjectionOpacity':.15,'source':source,'mosaic':json.loads((CACHE/'mosaic-stats.json').read_text()),'processing':'Dated native 10 m Sentinel-2 RGB TCI. Cloud/shadow-masked multi-date composite, bilinear reprojection into local WebPs. Larger overview does not add source resolution. Source OSM marine masks retain true island holes; no Esri or runtime external requests.'}
(DEST/'imagery-v1.json').write_text(json.dumps(manifest,separators=(',',':')));print('imagery pack bytes',sum(r['bytes']for r in[regional,overview,*tiles]),manifest['mosaic'],flush=True)
