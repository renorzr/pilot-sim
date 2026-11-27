"""Offline ASR spot check of assembled default transmissions, not flight evidence.
Checks every airport and voice, preserving the original take on unclear cases.
"""
import difflib,hashlib,json,pathlib,re,subprocess
import numpy as np
from faster_whisper import WhisperModel
ROOT=pathlib.Path(__file__).resolve().parents[1];FILE=ROOT/'game/src/comms/phrase-catalogue.json';pack=json.loads(FILE.read_text());models={};report=[];changed=0
def normalized(text,language):
 digits=list('零一二三四五六七八九')if language=='zh'else['zero','one','two','three','four','five','six','seven','eight','nine'];text=''.join(digits[int(c)]if c.isascii()and c.isdigit()else c for c in text).lower().replace('两','二').replace('〇','零');return ''.join(c for c in text if c.isalnum())
for airportIndex,airport in enumerate(['lga','jfk','lax','daxing','xiaoshan','changi','kansai']):
 for language in ['zh','en']:
  for actorIndex,actor in enumerate(['e','g','h','j','xiaoxiao']if language=='zh'else['guy','aria']):
   role=('pilot'if(airportIndex+actorIndex)%2==0 else'tower')if language=='zh'else('pilot'if actor=='guy'else'tower');clip=airport+'-'+('preparation-0'if role=='pilot'else'takeoff-0')
   if airport=='daxing'and role=='pilot':clip='ground-preparation-0'
   key=language+':'+actor+':'+clip;p=pack['clips'][key]
   if not p['parts']or not p.get('fallback'):continue
   data=subprocess.check_output(['ffmpeg','-v','error','-threads','1','-i',str(ROOT/'public'/p['fallback']['file']),'-ar','16000','-ac','1','-f','f32le','-']);audio=np.frombuffer(data,dtype='<f4');target=normalized(p['text'],language);best=None
   for model in ['tiny','base']:
    if model not in models:models[model]=WhisperModel(model,device='cpu',compute_type='int8',cpu_threads=2)
    segments,_=models[model].transcribe(audio,language=language,initial_prompt=p['text'],beam_size=1,condition_on_previous_text=False,vad_filter=False);actual=''.join(s.text for s in segments);matcher=difflib.SequenceMatcher(None,target,normalized(actual,language),autojunk=False);coverage=sum(n for a,b,n in matcher.get_matching_blocks())/len(target);result={'key':key,'expected':p['text'],'recognized':actual,'coverage':coverage,'model':model}
    if best is None or coverage>best['coverage']:best=result
    if coverage>=.86:break
   best['retainedWhole']=best['coverage']<.86;report.append(best)
   if best['retainedWhole']:
    p['parts']=[];p['duration']=p['source']['duration'];p.pop('fallback',None);changed+=1
   print(key,round(best['coverage'],3),'WHOLE'if best['retainedWhole']else'PASS',flush=True)
(ROOT/'qa/radio-production/seam-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if changed:
 pack.pop('fingerprint',None);pack['fingerprint']=hashlib.sha256(json.dumps(pack,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest();FILE.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
print('AUDIT',len(report),'assembled transmissions;',changed,'unclear cases retained as complete original takes',flush=True)
