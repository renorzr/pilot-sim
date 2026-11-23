"""Shared source frame; never modifies the playable airport or terrain."""
import json,math,pathlib
import numpy as np
from shapely.geometry import Polygon,box
from shapely.ops import transform,unary_union
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-kansai-city');CACHE.mkdir(exist_ok=True)
AIRPORT=json.loads((ROOT/'game/src/airports/data/kansai.json').read_text())
ENDS=next(r['ends']for r in AIRPORT['runways']if any(e['id']=='06R'for e in r['ends']));A=next(e for e in ENDS if e['id']=='06R');B=next(e for e in ENDS if e['id']!='06R')
EAST=6378137*math.pi/180*math.cos(math.radians(A['latitude']));NORTH=6378137*math.pi/180
ANGLE=math.atan2((B['longitude']-A['longitude'])*EAST,(B['latitude']-A['latitude'])*NORTH);CO,SI=math.cos(ANGLE),math.sin(ANGLE)
def project(lon,lat):
 e=(np.asarray(lon)-A['longitude'])*EAST;n=(np.asarray(lat)-A['latitude'])*NORTH
 return e*CO-n*SI,-e*SI-n*CO
def unproject(x,z):return A['longitude']+(np.asarray(x)*CO-np.asarray(z)*SI)/EAST,A['latitude']+(-np.asarray(x)*SI-np.asarray(z)*CO)/NORTH
def bounds(x0,z0,x1,z1):
 p=[unproject(x,z)for x,z in[(x0,z0),(x0,z1),(x1,z0),(x1,z1)]]
 return[min(float(q[1])for q in p),min(float(q[0])for q in p),max(float(q[1])for q in p),max(float(q[0])for q in p)]
def source_land():
 seas=[Polygon([project(*p)for p in f['geometry']],[[project(*p)for p in h]for h in f.get('holes',[])])for f in AIRPORT['osm']['features']if f['tags'].get('water')=='sea']
 return box(-30500,-30500,30500,30500).difference(unary_union(seas))
def geographic(poly):return transform(unproject,poly)
def tile_bounds(z,x,y):
 n=2**z;lon=lambda x:x/n*360-180;lat=lambda y:math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
 return(lon(x),lat(y+1),lon(x+1),lat(y))
def tile_xy(lon,lat,z):return int((lon+180)/360*2**z),int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
def metres(z,x,y):
 span=40075016.68557849/2**z;return(-20037508.342789244+x*span,20037508.342789244-y*span,span/256)
