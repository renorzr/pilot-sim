#!/usr/bin/env python3
"""Self-hosted GSI photo levels; original OSM island/coast masks remain authoritative."""
import concurrent.futures,hashlib,json,pathlib
import numpy as np,rasterio
from PIL import Image
from rasterio.transform import Affine
from rasterio.warp import reproject,Resampling,transform_bounds
from rasterio.features import rasterize
from rasterio.windows import Window
from shapely.geometry import Polygon,mapping,box,Point
from kansai_city_geo import ROOT,CACHE,AIRPORT,bounds,metres,source_land,project
DEST=ROOT/'public/assets/cities/kansai';DEST.mkdir(parents=True,exist_ok=True)
source=json.loads((CACHE/'gsi-provenance.json').read_text());records=source['items'];working=[]
for z in [15,16,17]:
 items=[r for r in records if int(r['id'].split('/')[0])==z and r['available']];coords=[list(map(int,r['id'].split('/')))for r in items];x0=min(p[1]for p in coords);x1=max(p[1]for p in coords);y0=min(p[2]for p in coords);y1=max(p[2]for p in coords);left,top,pixel=metres(z,x0,y0);path=CACHE/f'gsi-z{z}.tif';width=(x1-x0+1)*256;height=(y1-y0+1)*256
 if not path.exists():
  part=path.with_suffix('.part.tif')
  with rasterio.open(part,'w',driver='GTiff',width=width,height=height,count=3,dtype='uint8',crs='EPSG:3857',transform=Affine(pixel,0,left,0,-pixel,top),tiled=True,blockxsize=256,blockysize=256,compress='deflate',predictor=2,nodata=0,BIGTIFF='IF_SAFER',SPARSE_OK='TRUE')as out:
   for i,(r,(_,x,y))in enumerate(zip(items,coords)):
    image=np.asarray(Image.open(CACHE/r['file']).convert('RGB'));out.write(np.moveaxis(image,-1,0),window=Window((x-x0)*256,(y-y0)*256,256,256))
  part.replace(path)
 working.append({'file':path.name,'zoom':z,'tileGroundPixelMAtAirport':round(pixel*np.cos(np.radians(34.43)),4),'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()});print('Working raster',path.name,width,height,flush=True)
source['workingRasters']=working
(CACHE/'imagery-provenance.json').write_text(json.dumps(source,indent=2))
old_manifest=json.loads((DEST/'imagery-v1.json').read_text())if (DEST/'imagery-v1.json').exists()else{}
old_quality={r['id']:r.get('quality',91)for r in[old_manifest.get('regional'),old_manifest.get('overview'),*old_manifest.get('tiles',[])]if r}
def write(name,geo,size,local=None):
 path=DEST/(name+'.webp');south,west,north,east=geo;quality=85 if local and local[2]-local[0]>=6000 else 91
 if not path.exists()or old_quality.get(name,91)!=quality:
  tx=rasterio.transform.from_bounds(west,south,east,north,size,size);result=np.zeros((3,size,size),dtype='uint8')
  for item in working:
   with rasterio.Env(GDAL_CACHEMAX=48*1024**2),rasterio.open(CACHE/item['file'])as src:
    w,s,e,n=transform_bounds(src.crs,4326,*src.bounds)
    if e<=west or w>=east or n<=south or s>=north:continue
    array=np.zeros_like(result);reproject(source=rasterio.band(src,[1,2,3]),destination=array,src_transform=src.transform,src_crs=src.crs,dst_transform=tx,dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0,num_threads=1)
    valid=np.any(array>0,axis=0);result[:,valid]=array[:,valid]
  alpha=np.any(result>0,axis=0).astype('uint8')*255;rgba=np.dstack([np.moveaxis(result,0,-1),alpha]);part=path.with_suffix('.part.webp');Image.fromarray(rgba).save(part,'WEBP',quality=quality,method=4,exact=True);part.replace(path)
 r={'id':name,'path':'assets/cities/kansai/'+path.name,'bounds':geo,'width':size,'height':size,'quality':quality,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
 if local:r['localBounds']=local
 print('Imagery',name,r['bytes'],flush=True);return r
full=bounds(-30500,-30500,30500,30500);regional=write('gsi-regional-v1',full,2048);overview=write('gsi-overview-v1',full,4096);land=source_land();shore=Point(*project(135.31,34.415)).buffer(10000);specs=[]
for i,x in enumerate(range(-30000,30000,6000)):
 for j,z in enumerate(range(-30000,30000,6000)):
  cell=box(x,z,x+6000,z+6000)
  if land.intersection(cell).area<10:continue
  step=2000 if -6000<=x<6000 and -6000<=z<6000 else 3000 if land.intersection(cell).intersection(shore).area>1e6 else 6000
  for u in range(6000//step):
   for v in range(6000//step):
    local=[x+u*step,z+v*step,x+(u+1)*step,z+(v+1)*step]
    if land.intersection(box(*local)).area<10:continue
    specs.append((f'gsi-detail-v1-{i}-{j}-{u}-{v}',local))
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:tiles=list(pool.map(lambda s:write(s[0],bounds(*s[1]),2048,s[1]),specs))
def mask(record,name):
 s,w,n,e=record['bounds'];size=record['width'];shapes=[]
 for f in AIRPORT['osm']['features']:
  if f['tags'].get('water')=='sea':
   point=lambda p:((p[0]-w)/(e-w)*size,(n-p[1])/(n-s)*size)
   p=Polygon([point(q)for q in f['geometry']],[[point(q)for q in ring]for ring in f.get('holes',[])]).buffer(-.75,join_style=2)
   if not p.is_empty:shapes.append((mapping(p),255))
 arr=rasterize(shapes,out_shape=(size,size),transform=Affine.identity(),fill=0,dtype='uint8');path=DEST/(name+'.png');Image.fromarray(arr).save(path)
 return{'path':'assets/cities/kansai/'+path.name,'bounds':record['bounds'],'width':size,'height':size,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'sourceHoleCount':sum(len(f.get('holes',[]))for f in AIRPORT['osm']['features']if f['tags'].get('water')=='sea'),'processing':'Original source marine polygons, with every island hole, conservatively inset 0.75 image pixel.'}
manifest={'version':1,'airportId':'kansai','kind':'GSI seamless photography','label':'GSI Tiles / 国土地理院 · seamlessphoto','sourceNativeGsdM':None,'tileGroundPixelM':{'regional':working[0]['tileGroundPixelMAtAirport'],'coastal':working[1]['tileGroundPixelMAtAirport'],'airport':working[2]['tileGroundPixelMAtAirport']},'captureDates':[],'retrievedAt':source['retrievedAt'],'projection':'EPSG:4326 north-up; bounds south,west,north,east','regional':regional,'overview':overview,'tiles':tiles,'seaMask':mask(overview,'sea-mask-v1'),'coastMask':mask(regional,'coast-mask-v1'),'roofProjectionOpacity':.65,'source':source,'processing':'Only source GSI photographs, mosaicked at three tile zooms and bilinearly reprojected. Tile pixel spacing is not original photographic survey resolution. Capture dates are not exposed by the JPEG service. Alpha marks unavailable coverage. Original OSM island/coast masks and physical terrain remain unchanged. No generated imagery or runtime external map service.'}
(DEST/'imagery-v1.json').write_text(json.dumps(manifest,separators=(',',':')));print('Kansai imagery ready',len(tiles),'details',sum(r['bytes']for r in[regional,overview,*tiles]),flush=True)
