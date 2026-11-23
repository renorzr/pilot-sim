#!/usr/bin/env python3
"""Build-time GSI photograph acquisition, restricted to source land geometry.

Tile pixel spacing is not a claim about original survey resolution or dates.
No Esri service, credentials, generated pixels or runtime network dependency.
"""
import concurrent.futures,datetime,hashlib,json,math,time,urllib.error,urllib.request,csv,io,sys
from PIL import Image
from shapely.geometry import box,Point
from shapely.prepared import prep
from kansai_city_geo import CACHE,ROOT,source_land,geographic,project,tile_bounds,tile_xy,bounds
URL='https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'
def acquire():
 land=source_land();areas=[(15,land),(16,land.intersection(Point(*project(135.31,34.415)).buffer(10000))),(17,land.intersection(box(-6000,-6000,6000,6000)))];plan=[]
 for z,local in areas:
  area=geographic(local.buffer(120));valid=prep(area);w,s,e,n=area.bounds;x0,y0=tile_xy(w,n,z);x1,y1=tile_xy(e,s,z)
  for x in range(x0,x1+1):
   for y in range(y0,y1+1):
    if valid.intersects(box(*tile_bounds(z,x,y))):plan.append((z,x,y))
 print('Source tile plan',len(plan),{z:sum(p[0]==z for p in plan)for z,_ in areas},flush=True)
 (CACHE/'gsi-plan.json').write_text(json.dumps(plan));missing_path=CACHE/'gsi-missing.json';missing=set(json.loads(missing_path.read_text()))if missing_path.exists()else set();started=time.time()
 def fetch(spec):
  z,x,y=spec;key=f'{z}/{x}/{y}';path=CACHE/'tiles'/f'{key}.jpg';url=URL.format(z=z,x=x,y=y)
  if key in missing:return{'id':key,'url':url,'available':False,'reason':'publisher returned no tile'}
  if not path.exists():
   for attempt in range(4):
    try:
     with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=40)as r:blob=r.read();modified=r.headers.get('Last-Modified')
     path.parent.mkdir(parents=True,exist_ok=True);part=path.with_suffix('.part');part.write_bytes(blob)
     with Image.open(part)as im:
      if im.size!=(256,256):raise RuntimeError('Unexpected GSI tile size')
      im.verify()
     part.replace(path);break
    except urllib.error.HTTPError as e:
     if e.code in{404,410}:return{'id':key,'url':url,'available':False,'reason':'publisher returned HTTP '+str(e.code)}
     if attempt==3:raise
     time.sleep(1+attempt)
    except (OSError,RuntimeError):
     if attempt==3:raise
     time.sleep(1+attempt)
  w,s,e,n=tile_bounds(z,x,y);return{'id':key,'url':url,'available':True,'file':str(path.relative_to(CACHE)),'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'groundPixelMAtCentre':round(156543.03392804097*math.cos(math.radians((s+n)/2))/2**z,5)}
 records=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
  for i,r in enumerate(pool.map(fetch,plan),1):
   records.append(r)
   if not r['available']:missing.add(r['id'])
   if i%100==0:missing_path.write_text(json.dumps(sorted(missing)));print('GSI sources',i,'/',len(plan),'missing',len(missing),'seconds',round(time.time()-started,1),flush=True)
 missing_path.write_text(json.dumps(sorted(missing)))
 provenance={'provider':'Geospatial Information Authority of Japan (GSI)','layer':'seamlessphoto','urlTemplate':URL,'catalog':'https://maps.gsi.go.jp/development/ichiran.html','license':'GSI Content Terms of Use','licenseUrl':'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html','attribution':'Source: GSI Tiles / 国土地理院; locally reprojected and resampled','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acquisitionDates':None,'dateNote':'The seamless JPEG tile endpoint does not expose per-tile original capture dates. Retrieval date is not acquisition date. Sources may differ in date and survey resolution.','resolutionNote':'Zoom-level ground pixel spacing only; not independently verified original-photo resolution. Regional z15, coastal z16 and airport z17.','items':records}
 (CACHE/'gsi-provenance.json').write_text(json.dumps(provenance,indent=2));print('GSI acquisition ready',len(records),'available',sum(r['available']for r in records),'MiB',round(sum(r.get('bytes',0)for r in records)/2**20,1),flush=True)
def acquire_buildings():
 revision='82577ce04b0e30668a4eecef124c38ba08b86c13';base=f'https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/{revision}/';index='https://bfppub.blob.core.windows.net/%24web/2026-07-24/dataset-links.csv';path=CACHE/'ms-dataset-links.csv'
 if not path.exists():
  with urllib.request.urlopen(index,timeout=60)as r:path.write_bytes(r.read())
 s,w,n,e=bounds(-30500,-30500,30500,30500);region=box(w,s,e,n);selected=[]
 for row in csv.DictReader(io.StringIO(path.read_text())):
  if row['Location']!='Japan':continue
  x=y=0
  for c in row['QuadKey']:x=x*2+(int(c)&1);y=y*2+((int(c)>>1)&1)
  if region.intersects(box(*tile_bounds(len(row['QuadKey']),x,y))):selected.append(row)
 (CACHE/'ms-selected.json').write_text(json.dumps(selected,indent=2))
 def fetch(row):
  dest=CACHE/('ms-'+row['QuadKey']+'.geojsonl.gz')
  if not dest.exists():
   with urllib.request.urlopen(urllib.request.Request(row['Url'],headers={'User-Agent':'pilot-sim-offline-scenery/1.0'}),timeout=180)as r,dest.with_suffix('.part').open('wb')as out:
    while chunk:=r.read(4*1024**2):out.write(chunk)
   dest.with_suffix('.part').replace(dest)
  print('Building partition',row['QuadKey'],round(dest.stat().st_size/2**20,1),'MiB',flush=True)
  return{**row,'file':dest.name,'bytes':dest.stat().st_size,'sha256':hashlib.file_digest(dest.open('rb'),'sha256').hexdigest()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:items=list(pool.map(fetch,selected))
 license_path=ROOT/'ops/assets/licenses/microsoft-global-buildings-LICENSE';license_path.parent.mkdir(parents=True,exist_ok=True)
 with urllib.request.urlopen(base+'LICENSE',timeout=40)as r:license_path.write_bytes(r.read())
 provenance={'provider':'Microsoft Global ML Building Footprints','repository':'https://github.com/microsoft/GlobalMLBuildingFootprints','repositoryRevision':revision,'indexUrl':index,'indexSha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'license':'CDLA-Permissive-2.0','licenseUrl':base+'LICENSE','sourceDateNote':'Japan release added 2023-03-13; upstream imagery spans multiple years. Upload/index dates are not per-building photographic dates. Footprints are machine estimates; OSM has priority.','identity':'ms/<quadkey as integer * 10000000 + source line number>; local deterministic source-row identity, not an OSM ID','items':items}
 (CACHE/'ms-provenance.json').write_text(json.dumps(provenance,indent=2))
if __name__=='__main__':
 if '--buildings-only'not in sys.argv:acquire()
 if '--imagery-only'not in sys.argv:acquire_buildings()
