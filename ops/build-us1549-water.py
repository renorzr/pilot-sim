#!/usr/bin/env python3
"""Rebuild the historical NYC tidal reach and masks from pinned local OSM XML.

Uses shapely, numpy, rasterio and Pillow. No downloads during rebuild or build.
River relations retain their real shoreline/island geometry. Existing marine
water is subtracted before emitting additional meshes to avoid coplanar overlap.
"""
from pathlib import Path
import gzip, hashlib, json, xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union, transform
from rasterio.features import rasterize
from affine import Affine
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/assets/cities/us1549'
IDS=[1845135,14141926,17066325]
sha=lambda b:hashlib.sha256(b).hexdigest()
def assemble(tree,ident):
 nodes={n.attrib['id']:(float(n.attrib['lon']),float(n.attrib['lat']))for n in tree.findall('node')}
 ways={w.attrib['id']:[n.attrib['ref']for n in w.findall('nd')]for w in tree.findall('way')}
 rel=next(r for r in tree.findall('relation')if r.attrib['id']==str(ident))
 def rings(role):
  pending=[ways[m.attrib['ref']][:]for m in rel.findall('member')if m.attrib['type']=='way' and m.attrib.get('role','outer')==role]
  result=[]
  while pending:
   ring=pending.pop()
   while ring[-1]!=ring[0]:
    for i,w in enumerate(pending):
     if w[0]==ring[-1] or w[-1]==ring[-1]:
      if w[-1]==ring[-1]:w=w[::-1]
      ring.extend(w[1:]);pending.pop(i);break
    else:raise ValueError(f'Unclosed source {role} ring: {ident}')
   poly=Polygon([nodes[n]for n in ring]);assert poly.is_valid,(ident,role)
   result.append(poly)
  return result
 outer=unary_union(rings('outer'));inner=rings('inner')
 poly=outer.difference(unary_union(inner))if inner else outer
 assert poly.is_valid and not poly.is_empty
 return poly,rel
marine_source=json.loads((ROOT/'game/src/airports/data/jfk.json').read_text())
marine=[Polygon(f['geometry'],f.get('holes',[]))for f in marine_source['osm']['features']if f['tags'].get('water')=='sea']
polygons=[];snapshots=[]
for ident in IDS:
 path=ROOT/f'ops/assets/us1549-water/relation-{ident}.osm.gz';packed=path.read_bytes();raw=gzip.decompress(packed);poly,rel=assemble(ET.fromstring(raw),ident);polygons.append(poly)
 snapshots.append({'id':f'relation/{ident}','url':f'https://api.openstreetmap.org/api/0.6/relation/{ident}/full','path':str(path.relative_to(ROOT)),'bytes':len(packed),'sha256':sha(packed),'decodedSHA256':sha(raw),'version':int(rel.attrib['version']),'sourceTimestamp':rel.attrib['timestamp']})
river=unary_union(polygons);extra=river.difference(unary_union(marine));assert extra.is_valid
parts=[extra]if extra.geom_type=='Polygon'else list(extra.geoms)
features=[]
for i,p in enumerate(parts):
 if p.geom_type!='Polygon' or p.area<1e-12:continue
 features.append({'id':f'derived/us1549-tidal-hudson/{i}','tags':{'natural':'water','water':'river','tidal':'yes'},'waterbody':'Hudson River','tidalSurface':True,'surfaceMSL':0,'geometry':[list(q)for q in p.exterior.coords],'holes':[[list(q)for q in r.coords]for r in p.interiors],'sourceFeatureIds':[s['id']for s in snapshots]})
data={'schemaVersion':1,'kind':'source tidal river water supplement','bounds':[extra.bounds[1],extra.bounds[0],extra.bounds[3],extra.bounds[2]],'features':features,'provenance':{'attribution':'© OpenStreetMap contributors','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','snapshots':snapshots,'derivation':'Closed OSM outer/inner member ways assembled by source node identity, unioned, then existing bundled marine water subtracted. No estimated shorelines, widened centreline strips or replacement land.','scope':'Hudson tidal reach north of the Harlem mouth through the bundled Tappan Zee source polygon; modern shoreline used as a 2009 scenery estimate.'}}
raw=(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n').encode();(ROOT/'game/src/history/tidal-water.json').write_bytes(raw)
base=json.loads((ROOT/'public/assets/cities/jfk/imagery-v1.json').read_text());manifest={**base,'airportId':'us1549','waterSourceSHA256':sha(raw)}
all_water=unary_union([*marine,river]);DEST.mkdir(parents=True,exist_ok=True)
def mask(record,name):
 south,west,north,east=record['bounds'];a,b,c,d=all_water.bounds;south,west,north,east=min(south,b),min(west,a),max(north,d),max(east,c);size=record['width']
 def pixels(x,y,z=None):return((np.asarray(x)-west)/(east-west)*size,(north-np.asarray(y))/(north-south)*size)
 inset=transform(pixels,all_water).buffer(-.75,join_style=2)
 arr=rasterize([(mapping(inset),255)],out_shape=(size,size),transform=Affine.identity(),fill=0,dtype='uint8')
 temporary=DEST/(name+'.png');Image.fromarray(arr).save(temporary);blob=temporary.read_bytes();path=DEST/(name+'-'+sha(blob)[:12]+'.png');temporary.rename(path)
 return{'path':str(path.relative_to(ROOT/'public')),'bounds':[south,west,north,east],'width':size,'height':size,'bytes':len(blob),'sha256':sha(blob),'sourceHoleCount':sum(len(p.interiors)for p in (list(all_water.geoms)if all_water.geom_type=='MultiPolygon'else[all_water])),'processing':'Bundled marine polygons plus pinned OSM tidal Hudson relations; conservative 0.75 pixel inset, retaining source land holes.'}
manifest['seaMask']=mask(base['overview'],'sea-mask-river-v1');manifest['coastMask']=mask(base['regional'],'coast-mask-river-v1');manifest['processing']=base['processing']+' Historical event water masks additionally include the pinned tidal Hudson source; original photographs and their content identities are unchanged.'
(DEST/'imagery-river-v1.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print(json.dumps({'features':len(features),'points':sum(len(f['geometry'])+sum(map(len,f['holes']))for f in features),'waterSourceSHA256':sha(raw),'bounds':data['bounds'],'maskBytes':manifest['seaMask']['bytes']+manifest['coastMask']['bytes']}))
