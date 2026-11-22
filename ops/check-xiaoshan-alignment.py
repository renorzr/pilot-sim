import json,math,pathlib,sys
import numpy as np,rasterio
from rasterio.transform import from_bounds
from rasterio.warp import reproject,Resampling
from rasterio.features import rasterize
from scipy.signal import fftconvolve
from scipy.ndimage import gaussian_filter
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-xiaoshan-city');DEST=pathlib.Path('/tmp/pilot-xiaoshan-alignment');DEST.mkdir(exist_ok=True);label=sys.argv[1]if len(sys.argv)>1 else'audit'
airport=json.loads((ROOT/'game/src/airports/data/xiaoshan.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='07'for e in r['ends']));a=next(e for e in ends if e['id']=='07');b=next(e for e in ends if e['id']!='07');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def unproject(x,z):return a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north
patches=[('west-industry',120.37,30.23),('north-village',120.44,30.29),('south-village',120.43,30.17),('river-west',120.28,30.24),('xiaoshan-town',120.27,30.16),('east-industry',120.54,30.25)]
selected={p[0]:{'osm':[],'eab':[]} for p in patches}
for line in (CACHE/'buildings.jsonl').open():
 oid,h,kind,hs,seed,roof,wall,rings=json.loads(line);r=rings[0];xs=[p[0]for p in r];zs=[p[1]for p in r];lon,lat=unproject((min(xs)+max(xs))/2,(min(zs)+max(zs))/2)
 for name,x,y in patches:
  if abs(lon-x)<.024 and abs(lat-y)<.021:
   coordinates=[[unproject(*p)for p in ring]+[unproject(*ring[0])]for ring in rings];selected[name]['eab'if oid.startswith('eab/')else'osm'].append(({'type':'Polygon','coordinates':coordinates},1))
fig,axes=plt.subplots(2,3,figsize=(18,12));results=[]
with rasterio.open(CACHE/'sentinel-2025-09-16-visual.tif')as src:
 for ax,(name,lon,lat) in zip(axes.flat,patches):
  w,s,e,n=lon-.024,lat-.021,lon+.024,lat+.021;size=480;tx=from_bounds(w,s,e,n,size,size);rgb=np.zeros((3,size,size),dtype='uint8')
  reproject(source=rasterio.band(src,[1,2,3]),destination=rgb,src_transform=src.transform,src_crs=src.crs,dst_transform=tx,dst_crs='EPSG:4326',resampling=Resampling.bilinear)
  image=np.moveaxis(rgb,0,-1);ax.imshow(image,extent=[w,e,s,n]);counts={}
  for typ,color in [('eab','#ff7333'),('osm','#25f5ed')]:
   shapes=selected[name][typ];counts[typ]=len(shapes)
   for p,_ in shapes:
    points=np.array(p['coordinates'][0]);ax.plot(points[:,0],points[:,1],color=color,alpha=.7,linewidth=.35)
   if shapes:
    mask=rasterize(shapes,out_shape=(size,size),transform=tx,fill=0,dtype='float32');photo=np.mean(rgb.astype('float32'),axis=0);photo-=gaussian_filter(photo,20);mask-=gaussian_filter(mask,20)
    corr=fftconvolve(photo,mask[::-1,::-1],mode='same');center=size//2;window=corr[center-70:center+71,center-70:center+71];dy,dx=np.array(np.unravel_index(np.argmax(window),window.shape))-70
    results.append({'patch':name,'source':typ,'buildings':len(shapes),'bestEastM':round(dx*(e-w)/size*east,1),'bestNorthM':round(-dy*(n-s)/size*north,1),'peakToZero':float(np.max(window)/max(.001,corr[center,center]))})
  ax.set_title(name+' '+str(counts));ax.set_aspect(1/math.cos(math.radians(lat)))
fig.suptitle('Source registration: orange = EAB, cyan = OSM; native Sentinel-2 RGB',fontsize=16);fig.tight_layout();fig.savefig(ROOT/('qa/xiaoshan-alignment-'+label+'.png'),dpi=140);(DEST/('correlation-'+label+'.json')).write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
