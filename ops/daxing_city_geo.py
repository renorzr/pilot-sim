"""Shared source frame; never modifies the playable airport or terrain."""
import json,math,pathlib
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-daxing-city');CACHE.mkdir(exist_ok=True)
AIRPORT=json.loads((ROOT/'game/src/airports/data/daxing.json').read_text())
ENDS=next(r['ends']for r in AIRPORT['runways']if any(e['id']=='17L'for e in r['ends']));A=next(e for e in ENDS if e['id']=='17L');B=next(e for e in ENDS if e['id']!='17L')
EAST=6378137*math.pi/180*math.cos(math.radians(A['latitude']));NORTH=6378137*math.pi/180
ANGLE=math.atan2((B['longitude']-A['longitude'])*EAST,(B['latitude']-A['latitude'])*NORTH);CO,SI=math.cos(ANGLE),math.sin(ANGLE)
def project(lon,lat):
 e=(np.asarray(lon)-A['longitude'])*EAST;n=(np.asarray(lat)-A['latitude'])*NORTH
 return e*CO-n*SI,-e*SI-n*CO
def unproject(x,z):return A['longitude']+(np.asarray(x)*CO-np.asarray(z)*SI)/EAST,A['latitude']+(-np.asarray(x)*SI-np.asarray(z)*CO)/NORTH
def bounds(x0,z0,x1,z1):
 p=[unproject(x,z)for x,z in[(x0,z0),(x0,z1),(x1,z0),(x1,z1)]]
 return[min(float(q[1])for q in p),min(float(q[0])for q in p),max(float(q[1])for q in p),max(float(q[0])for q in p)]
