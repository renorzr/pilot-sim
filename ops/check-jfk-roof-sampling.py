#!/usr/bin/env python3
"""Compare the optional kernel against the independent original Python sampler."""
import collections,json,pathlib,time
from city_roof_sampling import RoofSampler
from city_roof_sampling_fast import FastRoofSampler
from importlib.util import spec_from_file_location,module_from_spec
# Pure frame math only, without importing the extraction script's work loop.
import numpy as np,math
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=pathlib.Path('/tmp/pilot-jfk-city');airport=json.loads((ROOT/'game/src/airports/data/jfk.json').read_text());ends=next(r['ends']for r in airport['runways']if any(e['id']=='22R'for e in r['ends']));a=next(e for e in ends if e['id']=='22R');b=next(e for e in ends if e['id']!='22R');east=6378137*math.pi/180*math.cos(math.radians(a['latitude']));north=6378137*math.pi/180;angle=math.atan2((b['longitude']-a['longitude'])*east,(b['latitude']-a['latitude'])*north);co,si=math.cos(angle),math.sin(angle)
def unproject(x,z):return a['longitude']+(x*co-z*si)/east,a['latitude']+(-x*si-z*co)/north
items=json.loads((CACHE/'imagery-provenance.json').read_text())['items'];checked=0
for path in sorted((CACHE/'roof-buckets').glob('bucket-*.jsonl'))[::9]:
 index=int(path.stem.split('-')[-1]);
 if index<0:continue
 kwargs={'min_brightness':18,'vegetation_screen':False};plain=RoofSampler(CACHE/'cogs'/items[index]['workingFile'],unproject,**kwargs);fast=FastRoofSampler(CACHE/'cogs'/items[index]['workingFile'],unproject,**kwargs)
 for i,line in enumerate(path.open()):
  if i>=24:break
  r=json.loads(line);expect=plain.sample(r[5])[0];got=fast.sample(r[5])[0];assert expect==got,(r[0],expect,got);checked+=1
 del plain,fast
print('Equivalent roof kernel verified against the original sampler:',checked,'actual source footprints')
