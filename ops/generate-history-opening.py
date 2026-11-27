"""Opening dialogue: same-actor approved Chinese excerpts and existing English actors.
No historical recording is reused, and no Fish credential is required.
"""
import asyncio,hashlib,json,pathlib,re,subprocess
import edge_tts
ROOT=pathlib.Path(__file__).resolve().parents[1];STAGE=ROOT/'qa/history-opening/audio';STAGE.mkdir(parents=True,exist_ok=True)
MANIFEST=ROOT/'game/src/history/opening-assets.json'
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def pauses(path):
 r=subprocess.run(['ffmpeg','-nostdin','-v','info','-i',str(path),'-af','silencedetect=noise=-33dB:d=0.08','-f','null','-'],capture_output=True,text=True,check=True)
 starts=[float(x) for x in re.findall(r'silence_start: ([0-9.]+)',r.stderr)];ends=[float(x) for x in re.findall(r'silence_end: ([0-9.]+)',r.stderr)];return starts,ends
def publish(path,voice,ident):
 data=path.read_bytes();sha=hashlib.sha256(data).hexdigest();folder=ROOT/'public/assets/radio/us1549/opening';folder.mkdir(parents=True,exist_ok=True);target=folder/(voice+'-'+ident+'-'+sha[:16]+'.mp3');target.write_bytes(data)
 seconds=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(target)]));return {'path':str(target.relative_to(ROOT/'public')),'duration':round(seconds,3),'bytes':len(data),'sha256':sha}
async def main():
 script=json.loads((ROOT/'game/src/history/opening-script.json').read_text());crew=json.loads((ROOT/'game/src/history/crew-cast.json').read_text());history=json.loads((ROOT/'game/src/history/voice-assets.json').read_text());excerpts=json.loads((ROOT/'game/src/failure/voice-assets.json').read_text())['excerpts']['zh'];normal=json.loads((ROOT/'game/src/comms/pilot-voices.json').read_text())['voices'];m={'schema':1,'clips':{'zh':{},'en':{}}}
 for actor,index in [(v,0) for v in ['e','j','xiaoxiao']]+[(crew['zh']['pilot'],1)]:
  prefix=history['clips']['zh'][actor]['us1549-lga-0'];prefix_range=excerpts[actor]['history-call']['ranges'][0];body=normal[actor]['clips']['airline-cruise-ready-'+str(index)];body_item=body if index==0 else body['clean'];body_path=ROOT/'public/assets/radio/pilots'/actor/body_item['file'];starts,ends=pauses(body_path)
  boundary=next((v for v in (ends if index==0 else starts) if .45<v<2.3),None);assert boundary is not None,(actor,starts,ends)
  ranges=[{'path':prefix['path'],'sha256':prefix['sha256'],'range':prefix_range},{'path':str(body_path.relative_to(ROOT/'public')),'sha256':body_item['sha256'],'range':[boundary,body_item['duration']] if index==0 else [0,boundary]}]
  if index==1:ranges.reverse()
  identity=digest({'ranges':ranges,'normalization':'loudnorm-18-v1'});out=STAGE/(identity+'.mp3')
  if not out.exists():
   cmd=['ffmpeg','-nostdin','-v','error','-y'];filters=[];labels=[]
   for i,item in enumerate(ranges):cmd+=['-i',str(ROOT/'public'/item['path'])];a,b=item['range'];filters.append(f'[{i}:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}]');labels.append(f'[a{i}]')
   filters.append(''.join(labels)+'concat=n=2:v=0:a=1,loudnorm=I=-18:TP=-2:LRA=7[out]');subprocess.run(cmd+['-filter_complex',';'.join(filters),'-map','[out]','-ar','24000','-ac','1','-b:a','48k',str(out)],check=True)
  role,text,channel=script['zh'][index];item=publish(out,actor,role);item.update({'voice':actor,'role':role,'text':text,'channel':channel,'provider':'approved-same-actor-excerpts','sources':ranges});m['clips']['zh'].setdefault(actor,{})['us1549-opening-'+str(index)]=item;print('zh',actor,role,item['duration'],ranges,flush=True)
 for index,actor,profile in [(0,'aria',{'voice':'en-US-AriaNeural','rate':'+22%','pitch':'-6Hz'}),(1,'guy',{'voice':'en-US-GuyNeural','rate':'+24%','pitch':'-10Hz'})]:
  role,text,channel=script['en'][index];identity=digest({'text':text,'profile':profile});raw=STAGE/(identity+'.raw.mp3');out=STAGE/(identity+'.mp3')
  if not raw.exists():await edge_tts.Communicate(text,**profile).save(str(raw))
  if not out.exists():subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-ac','1','-b:a','48k',str(out)],check=True)
  item=publish(out,actor,role);item.update({'voice':actor,'role':role,'text':text,'channel':channel,'provider':'edge-tts','referenceId':profile['voice']});m['clips']['en'].setdefault(actor,{})['us1549-opening-'+str(index)]=item;print('en',actor,role,item['duration'],flush=True)
 m['version']=digest(m)[:20];tmp=MANIFEST.with_suffix('.tmp');tmp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');tmp.replace(MANIFEST);print('COMPLETE',flush=True)
if __name__=='__main__':asyncio.run(main())
