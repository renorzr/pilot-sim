"""Extract LGA airfield geometry from the pinned NY source, sharing NYC DEM/water.
Offline build: osmium, Shapely. Does not download scenery at runtime.
"""
import argparse,csv,datetime,hashlib,importlib.util,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('jfk_builder',ROOT/'ops/fetch-jfk-data.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
def main():
 p=argparse.ArgumentParser();p.add_argument('--pbf',type=pathlib.Path,default=pathlib.Path('/tmp/pilot-sim-jfk-data/new-york-261120.osm.pbf'));p.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('/tmp/pilot-lga'));a=p.parse_args();a.cache.mkdir(exist_ok=True,parents=True)
 pbf_sha=hashlib.sha256(a.pbf.read_bytes()).hexdigest();raw=a.cache/('airfield-'+pbf_sha[:16]+'.json')
 builder.AIRPORT_BOUNDS=[40.758,-73.901,40.795,-73.846]
 if raw.exists():osm=json.loads(raw.read_text())
 else:
  osm=builder.osm_data(a.pbf);osm['features']=[f for f in osm['features'] if any(builder.contains(q,builder.AIRPORT_BOUNDS) for q in f['geometry']) and (f['tags'].get('aeroway') or f['tags'].get('building'))];raw.write_text(json.dumps(osm,separators=(',',':')))
 airports=list(csv.DictReader(builder.download(builder.AIRPORT_URL+'airports.csv',a.cache/'airports.csv').decode('utf-8-sig').splitlines()));r=next(x for x in airports if x['ident']=='KLGA');airport={'ident':'KLGA','iata':'LGA','name':r['name'],'latitude':float(r['latitude_deg']),'longitude':float(r['longitude_deg']),'elevationM':float(r['elevation_ft'])*.3048}
 runways=[]
 for r in csv.DictReader(builder.download(builder.AIRPORT_URL+'runways.csv',a.cache/'runways.csv').decode('utf-8-sig').splitlines()):
  if r['airport_ident']!='KLGA' or r['closed']=='1':continue
  runways.append({'lengthM':float(r['length_ft'])*.3048,'widthM':float(r['width_ft'])*.3048,'surface':r['surface'],'ends':[{'id':r[prefix+'ident'],'longitude':float(r[prefix+'longitude_deg']),'latitude':float(r[prefix+'latitude_deg']),'elevationM':float(r[prefix+'elevation_ft'] or airport['elevationM']/.3048)*.3048} for prefix in ['le_','he_']]})
 pack={'schemaVersion':1,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'airport':airport,'runways':runways,'osm':osm,'regionalSource':'new-york','sources':[{'name':'OpenStreetMap contributors','url':builder.OSM_URL,'sha256':pbf_sha,'license':'ODbL-1.0'},{'name':'OurAirports','url':builder.AIRPORT_URL,'license':'Unlicense / public domain'}]}
 from shapely.geometry import Polygon,Point
 from shapely.ops import unary_union
 field=unary_union([Polygon(f['geometry'],f.get('holes',[])).buffer(0) for f in osm['features'] if f['tags'].get('aeroway')=='aerodrome'])
 pack['osm']={**osm,'features':[f for f in osm['features'] if f['tags'].get('aeroway') or any(field.covers(Point(q)) for q in f['geometry'])]}
 output=ROOT/'game/src/airports/data/lga.json';output.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n');print('LGA',airport,'runways',len(runways),'features',len(pack['osm']['features']),flush=True)
 departure=builder.departure_data(pack,airport_id='lga',active_runway='04',side=-1,entry_min_ratio=.2);before,last=departure['taxiPoints'][-2:];departure['hold']['yaw']=__import__('math').atan2(last['x']-before['x'],before['z']-last['z']);output.with_name('lga-departure.json').write_text(json.dumps(departure,ensure_ascii=False,indent=2)+'\n');print('LGA source stand',departure['stand']['ref'],'taxi',departure['taxiDistanceM'],flush=True)
if __name__=='__main__':main()
