"""Offline shared NYC vegetation derivative from the pinned NY/NJ OSM extracts.

Forest boundaries are sourced. Park tree cover, road clearances and individual
stand locations are estimates, explicitly kept apart from source OSM tags.
"""
import argparse, hashlib, json, math, gzip
from pathlib import Path
import osmium
from shapely.geometry import shape, Polygon, LineString, box, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parents[1]
EXTENT=40000

def main():
 p=argparse.ArgumentParser();p.add_argument('--new-york',type=Path,default=Path('/tmp/pilot-sim-jfk-data/new-york-261120.osm.pbf'));p.add_argument('--new-jersey',type=Path,default=Path('/tmp/pilot-jfk-city/new-jersey-261120.osm.pbf'));args=p.parse_args()
 manifest=json.loads((ROOT/'public/assets/cities/jfk/buildings-v1.json').read_text());sources=manifest['provenance']['osm']['sources'];paths=[args.new_york,args.new_jersey]
 frame=manifest['frame'];origin=frame['threshold'];rad=math.pi/180;xs=6378137*rad*math.cos(origin['latitude']*rad);ys=6378137*rad;angle=frame['heading']*rad;c,s=math.cos(angle),math.sin(angle)
 def project(lon,lat,z=None):
  e=(lon-origin['longitude'])*xs;n=(lat-origin['latitude'])*ys;return e*c-n*s,-(e*s+n*c)
 def unproject(x,z,h=None):return origin['longitude']+(x*c-z*s)/xs,origin['latitude']+(-x*s-z*c)/ys
 clip=box(-EXTENT,-EXTENT,EXTENT,EXTENT);factory=osmium.geom.GeoJSONFactory();woods={};blocked=[]
 for path,source in zip(paths,sources):
  digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
  if digest!=source['sha256']:raise ValueError('Pinned OSM identity mismatch: '+str(path))
  print('Extract areas:',source['region'],flush=True)
  stream=osmium.FileProcessor(str(path)).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)).with_filter(osmium.filter.KeyFilter('natural','landuse','leisure','aeroway'))
  for area in stream:
   tags=dict(area.tags);forest=tags.get('natural')=='wood' or tags.get('landuse')=='forest';park=tags.get('leisure') in ['park','garden'];exclude=tags.get('natural') in ['water','sand','bare_rock'] or tags.get('leisure') in ['pitch','playground','swimming_pool','track'] or tags.get('aeroway') in ['aerodrome','apron']
   if not (forest or park or exclude):continue
   try:
    geometry=transform(project,shape(json.loads(factory.create_multipolygon(area)))).buffer(0)
    if not geometry.intersects(clip):continue
    geometry=geometry.intersection(clip)
    if exclude:blocked.append(geometry);continue
    oid=('way/' if area.from_way() else 'relation/')+str(area.orig_id());woods[oid]=(geometry,{k:v for k,v in tags.items() if k in ['natural','landuse','leisure','leaf_type','leaf_cycle','height','name']},not forest)
   except (RuntimeError,ValueError):continue
 print('Area candidates:',len(woods),'exclusions:',len(blocked),flush=True)
 geometries=[v[0] for v in woods.values()];tree=STRtree(geometries);clearances=[[] for _ in geometries];roads=set()
 class Roads(osmium.SimpleHandler):
  def way(self,w):
   tags=dict(w.tags);kind=tags.get('highway')
   if not kind or tags.get('tunnel','no') not in ['no','false','0'] or w.id in roads:return
   try:
    points=[project(n.lon,n.lat) for n in w.nodes]
    if len(points)<2:return
    x,z=points[0]
    if not any(abs(x)<EXTENT+300 and abs(z)<EXTENT+300 for x,z in points):return
    line=LineString(points)
    width=float(tags.get('width','').split(';')[0]) if tags.get('width','').replace('.','',1).isdigit() else 22 if kind in ['motorway','trunk'] else 12 if kind in ['primary','secondary'] else 3 if kind in ['footway','path','cycleway','steps'] else 7
    protection=line.buffer(min(40,width)/2+9,quad_segs=2);ids=tree.query(protection,predicate='intersects')
    for i in ids:clearances[i].append(protection)
    if len(ids):roads.add(w.id)
   except (osmium.InvalidLocationError,ValueError):return
 for path in paths:
  print('Clear mapped roads/paths:',path.name,flush=True);Roads().apply_file(str(path),locations=True,filters=[osmium.filter.KeyFilter('highway')])
 blocktree=STRtree(blocked);features=[]
 for i,(oid,(geom,tags,estimate)) in enumerate(woods.items()):
  exclusions=clearances[i]+[blocked[j] for j in blocktree.query(geom,predicate='intersects')]
  if exclusions:geom=geom.difference(unary_union(exclusions))
  geom=geom.simplify(.8,preserve_topology=True)
  parts=list(geom.geoms) if geom.geom_type=='MultiPolygon' else [geom]
  for j,part in enumerate(parts):
   if part.geom_type!='Polygon' or part.area<240:continue
   rings=mapping(transform(unproject,part))['coordinates'];roundring=lambda ring:[[round(lon,7),round(lat,7)] for lon,lat in ring]
   features.append({'id':oid+'/'+str(j),'tags':tags,'geometry':roundring(rings[0]),'holes':[roundring(r) for r in rings[1:]],**({'treeCoverageEstimate':.32} if estimate else {})})
 features.sort(key=lambda f:f['id']);out=ROOT/'public/assets/cities/new-york/woodlands-v1.json';out.parent.mkdir(parents=True,exist_ok=True)
 value={'version':1,'regionId':'new-york','extent':EXTENT,'frame':frame,'features':features,'provenance':{'sources':[{k:v for k,v in source.items() if k!='file'} for source in sources],'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','derivation':'Source forest/wood and park/garden polygons, retaining source tags. Boundaries clipped to the shared NYC region and cleared around mapped water, sports areas, aerodromes and roads/paths. Park canopy coverage (.32), clearance widths, stand positions, tree sizes and species fallbacks are visual estimates, not a survey or a 2009 land-cover reconstruction.'}}
 raw=(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n').encode();packed=gzip.compress(raw,compresslevel=9,mtime=0);payload=out.with_name('woodlands-v1.source.json.gz');payload.write_bytes(packed)
 manifest={k:value[k] for k in ['version','regionId','extent','frame','provenance']};manifest.update(path='assets/cities/new-york/'+payload.name,features=len(features),parkEstimates=sum(bool(f.get('treeCoverageEstimate')) for f in features),bytes=len(packed),decodedBytes=len(raw),sha256=hashlib.sha256(packed).hexdigest(),decodedSha256=hashlib.sha256(raw).hexdigest());out.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'features':len(features),'parkEstimates':manifest['parkEstimates'],'excludedRoads':len(roads),'bytes':len(packed),'decodedBytes':len(raw)}),flush=True)
if __name__=='__main__':main()
