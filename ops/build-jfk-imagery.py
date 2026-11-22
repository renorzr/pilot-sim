#!/usr/bin/env python3
"""Georeferenced self-hosted NAIP levels on the original JFK DEM frame.

Working COGs are lossless reduced reads of dated 0.6 m sources. The airport
uses 1.2 m working pixels; the region uses 2.4 m. Stored detail grids sample
roughly 1.4 m and 2.8 m respectively; upsampling never claims native detail.
"""
import concurrent.futures,hashlib,json,math,pathlib
import numpy as np,rasterio
from PIL import Image
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds,Affine
from rasterio.features import rasterize
from shapely.geometry import Polygon,mapping
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-jfk-city');DEST=ROOT/'public/assets/cities/jfk';DEST.mkdir(parents=True,exist_ok=True)
airport=json.loads((ROOT/'game/src/airports/data/jfk.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='22R'for e in r['ends']));a=next(e for e in ends if e['id']=='22R');b=next(e for e in ends if e['id']!='22R');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def unproject(x,z):return(a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north)
def bounds(x0,z0,x1,z1):
 p=[unproject(x,z)for x,z in[(x0,z0),(x0,z1),(x1,z0),(x1,z1)]]
 return[min(p[1]for p in p),min(p[0]for p in p),max(p[1]for p in p),max(p[0]for p in p)]
source=json.loads((CACHE/'imagery-provenance.json').read_text());items=source['items']
def write(name,geo_bounds,size,local=None):
 path=DEST/(name+'.webp');s,w,n,e=geo_bounds
 if not path.exists():
  result=np.zeros((3,size,size),dtype='uint8');tx=from_bounds(w,s,e,n,size,size)
  for item in items:
   a,b,c,d=item['bbox'];x0=max(0,math.floor((a-w)/(e-w)*size));x1=min(size,math.ceil((c-w)/(e-w)*size));y0=max(0,math.floor((n-d)/(n-s)*size));y1=min(size,math.ceil((n-b)/(n-s)*size))
   if x1<=x0 or y1<=y0:continue
   arr=np.zeros((3,y1-y0,x1-x0),dtype='uint8')
   with rasterio.Env(GDAL_CACHEMAX=32*1024**2):
    with rasterio.open(CACHE/'cogs'/item['workingFile'])as src:reproject(source=rasterio.band(src,[1,2,3]),destination=arr,src_transform=src.transform,src_crs=src.crs,dst_transform=tx*Affine.translation(x0,y0),dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=1)
   valid=np.any(arr>0,axis=0);result[:,y0:y1,x0:x1][:,valid]=arr[:,valid]
  valid=np.any(result>0,axis=0);rgba=np.dstack([np.moveaxis(result,0,-1),valid.astype('uint8')*255]);Image.fromarray(rgba).save(path,'WEBP',quality=91,method=4,exact=True)
 record={'id':name,'path':'assets/cities/jfk/'+path.name,'bounds':geo_bounds,'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
 print('imagery',name,record['bytes'],flush=True);return record
full=bounds(-30500,-30500,30500,30500)
regional=write('naip-regional-v1',full,2048);overview=write('naip-overview-v1',full,4096)
specs=[]
for i,x in enumerate(range(-30000,30000,4000)):
 for j,z in enumerate(range(-30000,30000,4000)):
  # The central 12 km square replaces the coarse cell with four finer cells.
  # This offset grid brackets the actual airport and approach corridor.
  fine=(-6000<=x<6000 and -6000<=z<6000)
  if fine:
   for u in range(2):
    for v in range(2):specs.append((f'naip-airport-v1-{i}-{j}-{u}-{v}',(x+u*2000,z+v*2000,x+(u+1)*2000,z+(v+1)*2000),2048))
  else:specs.append((f'naip-detail-v1-{i}-{j}',(x,z,x+4000,z+4000),2048))
def tile(spec):
 name,local,size=spec;return write(name,bounds(*local),size,local)
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:tiles=list(pool.map(tile,specs))
def mask(record,name):
 s,w,n,e=record['bounds'];size=record['width'];shapes=[]
 for f in airport['osm']['features']:
  if f['tags'].get('water')=='sea':
   point=lambda p:((p[0]-w)/(e-w)*size,(n-p[1])/(n-s)*size)
   p=Polygon([point(p)for p in f['geometry']],[[point(p)for p in ring]for ring in f.get('holes',[])]).buffer(-.75,join_style=2)
   if not p.is_empty:shapes.append((mapping(p),255))
 arr=rasterize(shapes,out_shape=(size,size),transform=Affine.identity(),fill=0,dtype='uint8');path=DEST/(name+'.png');Image.fromarray(arr).save(path)
 return {'path':'assets/cities/jfk/'+path.name,'bounds':record['bounds'],'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'sourceHoleCount':sum(len(f.get('holes',[]))for f in airport['osm']['features']if f['tags'].get('water')=='sea'),'processing':'Source polygons in pixel coordinates, conservatively inset 0.75 pixel; no white mask pixel is intended to cover a source island.'}
manifest={'version':1,'airportId':'jfk','kind':'NAIP orthophotography','label':'USDA NAIP 2022 · 0.6 m source','sourceNativeGsdM':.6,'workingGsdM':[1.2,2.4],'captureDates':sorted(set(i['datetime']for i in items)),'projection':'EPSG:4326 north-up; bounds south,west,north,east','regional':regional,'overview':overview,'tiles':tiles,'seaMask':mask(overview,'sea-mask-v1'),'coastMask':mask(regional,'coast-mask-v1'),'roofProjectionOpacity':.85,'source':source,'processing':'Source 0.6 m NAIP RGB, lossless 1.2/2.4 m working COGs, bilinear reprojected WebP levels. Airport detail samples approximately 1.4 m; regional detail approximately 2.8 m. Source OSM sea polygons preserve 241 island holes. Alpha denotes unavailable coverage; no generated replacement pixels and no runtime external imagery service.'}
(DEST/'imagery-v1.json').write_text(json.dumps(manifest,separators=(',',':')));print('imagery ready',len(tiles),'detail tiles',sum(r['bytes']for r in[regional,overview,*tiles]),flush=True)
