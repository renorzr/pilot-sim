#!/usr/bin/env python3
"""Acquire pinned OSM and reduced NAIP COG working files; runtime is offline.

Range reads fetch source 2x / 4x pyramids (1.2 m airport / 2.4 m regional working pixels). Native
NAIP acquisition is 0.6 m. Working files retain CRS/affine transforms and are
losslessly cached; no World Imagery/Esri runtime service or credentials.
"""
import concurrent.futures,hashlib,json,pathlib,urllib.parse,urllib.request
import rasterio
from rasterio.windows import from_bounds,Window
from rasterio.warp import transform_bounds
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-jfk-city');CACHE.mkdir(exist_ok=True)
BOUNDS=[40.267,-74.265,41.031,-73.264]
NJ_URL='https://download.geofabrik.de/north-america/us/new-jersey/new-jersey-261120.osm.pbf'
def sha(path):return hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
def get(url,path):
 if not path.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=180)as src,path.with_suffix('.part').open('wb')as out:
   while chunk:=src.read(4*1024**2):out.write(chunk)
  path.with_suffix('.part').replace(path)
 return path

def osm():
 ny=pathlib.Path('/tmp/pilot-sim-jfk-data/new-york-261120.osm.pbf');assert ny.exists()
 nj=get(NJ_URL,CACHE/'new-jersey-261120.osm.pbf')
 records=[{'region':name,'source':url,'file':str(p),'snapshot':'2026-11-20','sha256':sha(p),'bytes':p.stat().st_size,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors / ODbL'}for name,url,p in [('New York','https://download.geofabrik.de/north-america/us/new-york/new-york-261120.osm.pbf',ny),('New Jersey',NJ_URL,nj)]]
 (CACHE/'osm-provenance.json').write_text(json.dumps(records,indent=2));print('OSM sources ready',[(r['region'],r['bytes'])for r in records],flush=True)
def imagery():
 s,w,n,e=BOUNDS;path=CACHE/'naip-selected-2022.json'
 if not path.exists():
  q={'collections':'naip','bbox':f'{w},{s},{e},{n}','datetime':'2022-01-01T00:00:00Z/2022-12-31T23:59:59Z','limit':'500'}
  catalog=json.load(urllib.request.urlopen('https://planetarycomputer.microsoft.com/api/stac/v1/search?'+urllib.parse.urlencode(q),timeout=90));assert not any(i['rel']=='next'for i in catalog.get('links',[]));catalog['features']=[i for i in catalog['features']if i['id'].startswith(('ny_','nj_'))];path.write_text(json.dumps(catalog))
 catalog=json.loads(path.read_text());items=sorted(catalog['features'],key=lambda i:i['id']);assert len(items)>100;(CACHE/'cogs').mkdir(exist_ok=True)
 def fetch(item):
  a,b,c,d=item['bbox'];hires=c> -73.931 and a< -73.598 and d>40.523 and b<40.774
  target=CACHE/'cogs'/(item['id']+('-hires'if hires else'')+'.tif');href=item['assets']['image']['href']
  if not target.exists():
   with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES',GDAL_HTTP_TIMEOUT='60',GDAL_HTTP_MAX_RETRY='3',GDAL_CACHEMAX=64*1024**2):
    with rasterio.open(href,overview_level=0 if hires else 1)as src:
     # Retain only the working image intersection, including a small margin.
     box=transform_bounds(4326,src.crs,w-.002,s-.002,e+.002,n+.002);window=from_bounds(*box,src.transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height));arr=src.read([1,2,3],window=window);tx=src.window_transform(window);profile={'driver':'GTiff','width':arr.shape[2],'height':arr.shape[1],'count':3,'dtype':'uint8','crs':src.crs,'transform':tx,'compress':'deflate','tiled':True}
     with rasterio.open(target.with_suffix('.part'),'w',**profile)as out:out.write(arr)
   target.with_suffix('.part').replace(target)
  print('NAIP working COG',item['id'],target.stat().st_size,flush=True)
  return {'id':item['id'],'datetime':item['properties']['datetime'],'gsdM':item['properties']['gsd'],'bbox':item['bbox'],'href':href,'stacSha256':hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest(),'workingFile':target.name,'workingGsdM':1.2 if hires else 2.4,'workingSha256':sha(target),'workingBytes':target.stat().st_size}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:records=list(pool.map(fetch,items))
 (CACHE/'imagery-provenance.json').write_text(json.dumps({'collection':'naip','catalog':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip','catalogSha256':sha(path),'sourceNativeGsdM':.6,'workingGsdM':[1.2,2.4],'license':'Public Domain with Attribution','licenseUrl':'https://registry.opendata.aws/naip/','attribution':'USDA Farm Service Agency / NAIP 2022; local RGB derivatives','items':records},indent=2))
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  for task in [pool.submit(osm),pool.submit(imagery)]:task.result()
