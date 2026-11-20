"""Build self-hosted radio speech. Optional staging keeps live clips intact."""
import argparse,asyncio,json,subprocess,pathlib,tempfile,hashlib,shutil
import edge_tts
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--staging-dir',type=pathlib.Path)
parser.add_argument('--require-neural',action='store_true')
parser.add_argument('--language',choices=['zh','en'],default='zh')
args=parser.parse_args()
out=(args.staging_dir/'radio') if args.staging_dir else root/'public/assets/radio'
out.mkdir(parents=True,exist_ok=True)
if args.staging_dir:shutil.copytree(root/'public/assets/radio',out,dirs_exist_ok=True)
if args.language=='en':out=out/'en';out.mkdir(parents=True,exist_ok=True)
script=json.loads((root/('game/src/comms/script.en.json' if args.language=='en' else 'game/src/comms/script.json')).read_text())
items={f'{key}-{i}':{'role':role,'text':text,'lang':args.language} for key,lines in script.items() for i,(role,text) in enumerate(lines)}
for key,text in {'h1000':'One thousand','h500':'Five hundred','h200':'Two hundred','h100':'One hundred','h50':'Fifty','h40':'Forty','h30':'Thirty','h20':'Twenty, retard','h10':'Ten','ap-on':'Autopilot on','ap-off':'Autopilot off','go-around':'Go around','positive':'Positive climb','wind-shear':'Wind shear, wind shear, wind shear','engine-one':'Engine one failure','all-engines':'All engines failure','minimum':'Minimum','checklist':'Landing checklist complete','terrain':'Terrain ahead','pull-up':'Terrain, terrain, pull up','stall':'Stall, stall'}.items():items['call-'+key]={'role':'warning','text':text,'lang':'en'}
if args.language=='en':items={key:item for key,item in items.items() if item['role']!='warning'}
# Conversational voices and clipped phrase groups avoid the former news cadence.
# Distinct voices keep the radio roles clear; warnings retain their clean voice.
PROFILES={
 'tower':{'voice':'zh-CN-XiaoxiaoNeural','rate':'+24%','pitch':'-12Hz'},
 'pilot':{'voice':'zh-CN-YunxiNeural','rate':'+26%','pitch':'-18Hz'},
 'warning':{'voice':'en-US-GuyNeural','rate':'+6%','pitch':'+0Hz'},
}
if args.language=='en':PROFILES={'tower':{'voice':'en-US-AriaNeural','rate':'+22%','pitch':'-6Hz'},'pilot':{'voice':'en-US-GuyNeural','rate':'+24%','pitch':'-10Hz'}}
# The declaration and its Mandarin report are spoken by the same pilot.
SIGNAL_PROFILE=dict(PROFILES['pilot'])
assert SIGNAL_PROFILE==PROFILES['pilot'], 'Radio signal must keep the pilot speaker'
# Remove boundary padding only (keep natural pauses within PAN PAN).
# atempo preserves pitch and the pilot's vocal identity.
SIGNAL_RENDER={
 'filter':'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse,atempo=1.10',
 'gap':0.08,'body_gap':0.12,
}
SIGNALS={'MAYDAY, MAYDAY, MAYDAY.':'Mayday.','PAN PAN, PAN PAN, PAN PAN.':'Pan pan.'}
signal_tasks={}
async def signal_audio(unit):
 if unit not in signal_tasks:
  async def synth():
   path=pathlib.Path(tempfile.gettempdir())/('pilot-radio-signal-'+hashlib.sha256((unit+json.dumps(SIGNAL_PROFILE,sort_keys=True)).encode()).hexdigest()[:16]+'.mp3')
   if not path.exists() or path.stat().st_size<1000:
    await asyncio.wait_for(edge_tts.Communicate(unit,**SIGNAL_PROFILE).save(str(path)),35)
   return path
  signal_tasks[unit]=asyncio.create_task(synth())
 return await signal_tasks[unit]
manifest_path=root/('ops/.radio-voices.en.json' if args.language=='en' else 'ops/.radio-voices.json')
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
sem=asyncio.Semaphore(4)
async def generate(key,item):
 async with sem:
  target=out/(key+'.mp3');profile=PROFILES[item['role']]
  # Preserve the existing warning assets while invalidating dialogue when its
  # speaker, pitch or rate changes, even when the wording stays identical.
  signal=next(((prefix,unit) for prefix,unit in SIGNALS.items() if item['role']=='pilot' and item['text'].startswith(prefix)),None)
  identity=item if item['role']=='warning' else {**item,'profile':profile}
  if signal:identity={**identity,'signal_profile':SIGNAL_PROFILE,'signal_layout':'three-unit-tight-v3','signal_render':SIGNAL_RENDER}
  fingerprint=hashlib.sha256(json.dumps(identity,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
  if not target.exists() or target.stat().st_size<1000 or manifest.get(key)!=fingerprint:
   raw=pathlib.Path(tempfile.gettempdir())/(key+'-neural.mp3')
   try:
    body=item['text'][len(signal[0]):].strip() if signal else item['text']
    await asyncio.wait_for(edge_tts.Communicate(body,**profile).save(str(raw)),35)
    prefix_source=await signal_audio(signal[1]) if signal else None
    source=str(raw);source_type='neural'
   except Exception:
    if args.require_neural:raise
    raw=raw.with_suffix('.wav');subprocess.run(['espeak-ng','-v','cmn' if item['lang']=='zh' else 'en-us','-s','190' if item['lang']=='zh' else '160','-w',str(raw),item['text']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);source=str(raw);source_type='offline';prefix_source=None
   filters='highpass=f=300,lowpass=f=3300,loudnorm=I=-18:TP=-2:LRA=7'
   if prefix_source:
    # Assemble exactly THREE spoken units; PAN PAN is one unit (six PANs).
    # The word units and report use identical pilot voice/rate/pitch.
    # Separate units guarantee three complete calls without switching speakers.
    graph=('[0:a]aformat=sample_rates=24000:channel_layouts=mono,'+SIGNAL_RENDER['filter']+',asplit=3[p0][p1][p2];'
     f"anullsrc=r=24000:cl=mono:d={SIGNAL_RENDER['gap']}[g0];anullsrc=r=24000:cl=mono:d={SIGNAL_RENDER['gap']}[g1];anullsrc=r=24000:cl=mono:d={SIGNAL_RENDER['body_gap']}[g2];"
     '[1:a]aformat=sample_rates=24000:channel_layouts=mono[body];'
     '[p0][g0][p1][g1][p2][g2][body]concat=n=7:v=0:a=1,'+filters+'[out]')
    command=['ffmpeg','-y','-loglevel','error','-i',str(prefix_source),'-i',source,'-filter_complex',graph,'-map','[out]']
   else:command=['ffmpeg','-y','-loglevel','error','-i',source,'-af',filters]
   subprocess.run(command+['-ar','24000','-ac','1','-b:a','48k',str(target)],check=True)
   print(key,source_type,flush=True)
  duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(target)]))
  manifest[key]=fingerprint
  return key,round(duration,3)
async def main():
 durations=dict(await asyncio.gather(*(generate(k,v) for k,v in items.items())))
 suffix='.en' if args.language=='en' else ''
 duration_path=args.staging_dir/f'durations{suffix}.json' if args.staging_dir else root/f'game/src/comms/durations{suffix}.json'
 output_manifest=args.staging_dir/f'manifest{suffix}.json' if args.staging_dir else manifest_path
 duration_path.write_text(json.dumps(durations,ensure_ascii=False,indent=2)+'\n')
 output_manifest.write_text(json.dumps(manifest,indent=2)+'\n')
 version={'fingerprint':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:16]}
 version_path=args.staging_dir/f'voice-version{suffix}.json' if args.staging_dir else root/f'game/src/comms/voice-version{suffix}.json'
 version_path.write_text(json.dumps(version,indent=2)+'\n')
 print('Speech clips ready:',len(durations),flush=True)
asyncio.run(main())
