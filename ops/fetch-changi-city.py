#!/usr/bin/env python3
"""Acquire dated Sentinel-2 RGB/SCL sources for an offline Changi mosaic.

OSM uses the already pinned airport PBF. Imagery is a cloud-masked multi-date
composite, not a single photograph or sub-metre aerial survey.
"""
import concurrent.futures,hashlib,json,pathlib,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-changi-city');CACHE.mkdir(exist_ok=True)
DATES=('2025-12-05','2026-03-20','2026-03-25','2026-08-22');TILES=('48NUG','48NVG')
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=180)as r:return r.read()
def acquire():
 p=CACHE/'sentinel-selected.json'
 if p.exists():catalog=json.loads(p.read_text())
 else:
  query={'collections':'sentinel-2-l2a','bbox':'103.60,1.0,104.36,1.7','datetime':'2025-12-05T00:00:00Z/2026-08-23T00:00:00Z','limit':'1000'}
  catalog=json.loads(get('https://planetarycomputer.microsoft.com/api/stac/v1/search?'+urllib.parse.urlencode(query)));p.write_text(json.dumps(catalog))
 items=[]
 for date in DATES:
  for tile in TILES:
   candidates=[i for i in catalog['features']if tile in i['id']and i['properties']['datetime'].startswith(date)]
   if not candidates:raise RuntimeError('Missing dated satellite tile '+date+' '+tile)
   items.append(min(candidates,key=lambda i:i['properties']['eo:cloud_cover']))
 (CACHE/'selected-items.json').write_text(json.dumps(items))
 def fetch(item):
  files={}
  for key in ['visual','SCL']:
   href=item['assets'][key]['href'];path=CACHE/(item['id']+'-'+key+'.tif')
   if not path.exists():
    signed=json.loads(get('https://planetarycomputer.microsoft.com/api/sas/v1/sign?href='+urllib.parse.quote(href,safe='')))['href']
    with urllib.request.urlopen(signed,timeout=180)as r,path.with_suffix('.part').open('wb')as out:
     while chunk:=r.read(4*1024*1024):out.write(chunk)
    path.with_suffix('.part').replace(path)
   files[key]={'href':href,'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
  print('satellite',item['id'],round(files['visual']['bytes']/1024**2,1),'MiB',flush=True)
  return {'itemId':item['id'],'datetime':item['properties']['datetime'],'cloudCoverPercent':item['properties']['eo:cloud_cover'],'assets':files,'stacSha256':hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:records=list(pool.map(fetch,items))
 provenance={'collection':'sentinel-2-l2a','catalog':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a','sourceNativeGsdM':10,'license':'Copernicus Sentinel Data Legal Notice','licenseUrl':'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice','attribution':'Contains modified Copernicus Sentinel data (2025–2026), processed by ESA / Microsoft Planetary Computer; cloud-masked local composite','items':records}
 (CACHE/'satellite-provenance.json').write_text(json.dumps(provenance,indent=2))
if __name__=='__main__':acquire()
