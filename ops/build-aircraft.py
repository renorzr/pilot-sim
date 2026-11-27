#!/usr/bin/env python3
"""Dispatch a registered model's authoring template using shared geometry tools.
Run: blender -b --python ops/build-aircraft.py -- --model a320 --output-dir /tmp/review
Runtime builds use checked-in models; Blender is only required for authoring.
"""
import argparse, json, pathlib, runpy, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(add_help=False);parser.add_argument('--model',default='a320')
args,remaining=parser.parse_known_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
# Only checked-in definitions/templates can be dispatched; never accept a path.
definitions={p.stem:p for p in (ROOT/'game/src/aircraft/definitions').glob('*.json')}
if args.model not in definitions:raise SystemExit('Unknown aircraft model: '+args.model)
definition=json.loads(definitions[args.model].read_text())
templates={'a320':ROOT/'ops/aircraft/a320.py','a380':ROOT/'ops/aircraft/a380.py'}
template=templates.get(definition['authoring']['template'])
if template is None:raise SystemExit('No authoring template for '+args.model)
sys.argv=[str(template),'--',*remaining]
runpy.run_path(str(template),run_name='__main__',init_globals={'AIRCRAFT_DEFINITION':definition})
