#!/usr/bin/env python3
"""Optional asset acquisition: attributed East Asian footprints + Sentinel-2.

Only selected city members are fetched from the 23 GB ZIP using byte ranges;
CRC32/length checks verify each uncompressed member. No runtime map API.
"""
import concurrent.futures,hashlib,io,json,pathlib,struct,urllib.parse,urllib.request,zlib
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-daxing-city');CACHE.mkdir(exist_ok=True)
RECORD='https://zenodo.org/api/records/8174931';CITIES=('Beijing','Langfang','Baoding')
def get(url,path=None):
 if path and path.exists():return path.read_bytes()
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=120)as r:data=r.read()
 if path:path.write_bytes(data)
 return data
def acquire_osm():
 path=pathlib.Path('/tmp/daxing-hebei.osm.pbf')
 if not path.exists():
  url='https://download.geofabrik.de/asia/china/hebei/hebei-261120.osm.pbf'
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=180)as src,path.with_suffix('.part').open('wb')as dst:
   while chunk:=src.read(4*1024*1024):dst.write(chunk)
  path.with_suffix('.part').replace(path)
 if hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!='b18473ed6d18031788baf11d86cf22c2e91bc7c266886e7117b2a21ebe0c6e71':raise RuntimeError('Pinned Hebei/Beijing OSM source hash differs')
 print('OSM pinned source verified',flush=True)
def acquire_footprints():
 meta=json.loads(get(RECORD,CACHE/'eastasia.json'));assert meta['metadata']['license']['id']=='cc-by-4.0';rec=meta['files'][0];url=rec['links']['self'];total=rec['size']
 def ranged(start,n):
  req=urllib.request.Request(url+'?range='+str(start),headers={'Range':f'bytes={start}-{start+n-1}','User-Agent':'pilot-sim-offline-scenery/1.0'})
  with urllib.request.urlopen(req,timeout=180)as r:
   if r.status!=206 or not r.headers.get('Content-Range','').startswith('bytes '+str(start)+'-'):raise RuntimeError('Source server did not honour byte range')
   data=r.read()
  if len(data)!=n:raise RuntimeError('Truncated source range')
  return data
 class Remote(io.RawIOBase):
  def __init__(self):self.pos=0
  def seekable(self):return True
  def seek(self,o,w=0):self.pos=o if w==0 else self.pos+o if w==1 else total+o;return self.pos
  def tell(self):return self.pos
  def read(self,n=-1):
   n=total-self.pos if n<0 else min(n,total-self.pos)
   if not n:return b''
   d=ranged(self.pos,n);self.pos+=len(d);return d
 import zipfile
 with zipfile.ZipFile(Remote())as archive:
  members=[f for f in archive.infolist()if any(f.filename.startswith(prefix+c+'.')for prefix,c in [('China/Beijing/','Beijing'),('China/Hebei/','Langfang'),('China/Hebei/','Baoding')])and pathlib.Path(f.filename).suffix in {'.shp','.shx','.prj','.cpg'}]
 def fetch_member(f):
  path=CACHE/pathlib.Path(f.filename).name
  if not(path.exists()and path.stat().st_size==f.file_size):
   header=ranged(f.header_offset,30);fields=struct.unpack('<4s5H3I2H',header);start=f.header_offset+30+fields[-2]+fields[-1];packed=ranged(start,f.compress_size);data=zlib.decompress(packed,-15)if f.compress_type==8 else packed
   if len(data)!=f.file_size or zlib.crc32(data)!=f.CRC:raise RuntimeError('Source member integrity failure '+f.filename)
   path.write_bytes(data)
  data=path.read_bytes()
  if zlib.crc32(data)!=f.CRC:raise RuntimeError('Cached source integrity failure')
  print('footprints',path.name,path.stat().st_size,flush=True)
  return {'member':f.filename,'bytes':f.file_size,'compressedBytes':f.compress_size,'crc32':f'{f.CRC:08x}','sha256':hashlib.sha256(data).hexdigest()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:files=list(pool.map(fetch_member,members))
 provenance={'title':meta['metadata']['title'],'doi':'10.5281/zenodo.8174931','url':'https://zenodo.org/records/8174931','license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':'Qian Shi, Jiajun Zhu, Zhengyu Liu, Haonan Guo, Mengxi Liu, Zihong Liu and Xiaoping Liu (2023), East Asian building footprints','sourceDate':'2023-07-22','archiveMd5':rec['checksum'],'files':files}
 (CACHE/'footprint-provenance.json').write_text(json.dumps(provenance,indent=2))
def acquire_satellite():
 import math,numpy as np,rasterio,pyproj
 from rasterio.merge import merge
 from rasterio.transform import from_origin
 from rasterio.warp import transform_bounds
 from daxing_city_geo import bounds
 # A same-pass pair avoids seasonal seams across the MGRS tile boundary.
 ids=['S2C_MSIL2A_20251013T030711_R075_T50SMJ_20251013T064223','S2C_MSIL2A_20251013T030711_R075_T50TMK_20251013T064223']
 items=[];paths=[];opened=[];path=CACHE/'sentinel-2025-10-13-visual.tif'
 for id in ids:
  item=json.loads(get('https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/'+id,CACHE/(id+'.json')));items.append(item)
 if not path.exists():
  s,w,n,e=bounds(-30750,-30750,30750,30750);left,bottom,right,top=transform_bounds('EPSG:4326','EPSG:32650',w,s,e,n,densify_pts=21)
  left=math.floor(left/10)*10;bottom=math.floor(bottom/10)*10;right=math.ceil(right/10)*10;top=math.ceil(top/10)*10
  try:
   with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MAX_RETRY='4',GDAL_HTTP_RETRY_DELAY='2'):
    for item in items:
     href=item['assets']['visual']['href'];signed=json.loads(get('https://planetarycomputer.microsoft.com/api/sas/v1/sign?href='+urllib.parse.quote(href,safe='')))['href'];opened.append(rasterio.open(signed))
    arr,affine=merge(opened,bounds=(left,bottom,right,top),res=10,indexes=[1,2,3],nodata=0)
    if np.mean(np.any(arr>0,axis=0))<.999:raise RuntimeError('Incomplete satellite terrain coverage')
    with rasterio.open(path.with_suffix('.part.tif'),'w',driver='GTiff',width=arr.shape[2],height=arr.shape[1],count=3,dtype='uint8',crs='EPSG:32650',transform=affine,compress='deflate',tiled=True)as dst:dst.write(arr)
    path.with_suffix('.part.tif').replace(path)
  finally:
   for src in opened:src.close()
 provenance={'collection':'sentinel-2-l2a','catalog':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a','itemIds':ids,'datetime':items[0]['properties']['datetime'],'sourceNativeGsdM':10,'items':[{'id':i['id'],'datetime':i['properties']['datetime'],'cloudCoverPercent':i['properties']['eo:cloud_cover'],'href':i['assets']['visual']['href'],'stacSha256':hashlib.sha256(json.dumps(i,sort_keys=True).encode()).hexdigest()}for i in items],'license':'Copernicus Sentinel Data Legal Notice','licenseUrl':'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice','attribution':'Contains modified Copernicus Sentinel data (2025), processed by ESA / Microsoft Planetary Computer; local rendering derivatives','bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'processing':'Native 10 m true-colour same-pass tile windows merged in declared UTM50N. Source imagery unchanged; only spatial crop and lossless working raster.'}
 (CACHE/'satellite-provenance.json').write_text(json.dumps(provenance,indent=2));print('satellite',ids,path.stat().st_size,flush=True)
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:
  for result in [pool.submit(acquire_osm),pool.submit(acquire_footprints),pool.submit(acquire_satellite)]:result.result()
