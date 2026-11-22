#!/usr/bin/env python3
"""Optional asset acquisition: attributed East Asian footprints + Sentinel-2.

Only selected city members are fetched from the 23 GB ZIP using byte ranges;
CRC32/length checks verify each uncompressed member. No runtime map API.
"""
import concurrent.futures,hashlib,io,json,pathlib,struct,urllib.parse,urllib.request,zlib
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-xiaoshan-city');CACHE.mkdir(exist_ok=True)
RECORD='https://zenodo.org/api/records/8174931';CITIES=('Hangzhou','Jiaxing','Shaoxing')
def get(url,path=None):
 if path and path.exists():return path.read_bytes()
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=120)as r:data=r.read()
 if path:path.write_bytes(data)
 return data
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
  members=[f for f in archive.infolist()if any(f.filename.startswith('China/Zhejiang/'+c+'.')for c in CITIES)and pathlib.Path(f.filename).suffix in {'.shp','.shx','.dbf','.prj','.cpg'}]
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
 query={'collections':'sentinel-2-l2a','bbox':'120.0,29.85,120.85,30.62','datetime':'2025-09-16T00:00:00Z/2025-09-17T00:00:00Z','limit':'20'}
 catalog=json.loads(get('https://planetarycomputer.microsoft.com/api/stac/v1/search?'+urllib.parse.urlencode(query),CACHE/'sentinel-selected.json'));item=next(i for i in catalog['features']if'T51RTP'in i['id']);href=item['assets']['visual']['href'];path=CACHE/'sentinel-2025-09-16-visual.tif'
 if not path.exists():
  signed=json.loads(get('https://planetarycomputer.microsoft.com/api/sas/v1/sign?href='+urllib.parse.quote(href,safe='')))['href']
  with urllib.request.urlopen(signed,timeout=180)as r,path.with_suffix('.part').open('wb')as out:
   while chunk:=r.read(4*1024*1024):out.write(chunk)
  path.with_suffix('.part').replace(path)
 provenance={'collection':'sentinel-2-l2a','catalog':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a','itemId':item['id'],'datetime':item['properties']['datetime'],'cloudCoverPercent':item['properties']['eo:cloud_cover'],'sourceNativeGsdM':10,'href':href,'license':'Copernicus Sentinel Data Legal Notice','licenseUrl':'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice','attribution':'Contains modified Copernicus Sentinel data (2025), processed by ESA / Microsoft Planetary Computer; local rendering derivatives','bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'stacSha256':hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()}
 (CACHE/'satellite-provenance.json').write_text(json.dumps(provenance,indent=2));print('satellite',item['id'],path.stat().st_size,flush=True)
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  for result in [pool.submit(acquire_footprints),pool.submit(acquire_satellite)]:result.result()
