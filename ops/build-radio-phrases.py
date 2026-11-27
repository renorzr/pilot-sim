"""Author shared routine-radio phrases from approved existing source recordings.
No synthesis, credentials or runtime ASR. Source hashes guard alignment caches.
Uncertain boundaries retain the same complete performance, never another actor.
"""
import difflib,hashlib,json,pathlib,re,subprocess,wave
import numpy as np
from faster_whisper import WhisperModel
ROOT=pathlib.Path(__file__).resolve().parents[1];WORK=ROOT/'qa/radio-production';OUT=ROOT/'public/assets/radio/phrases/v1';OUT.mkdir(parents=True,exist_ok=True);RATE=24000
def identity(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def normalized(text,language=None):
 language=language or('zh'if re.search(r'[\u4e00-\u9fff]',text)else'en')
 digits=list('零一二三四五六七八九')if language=='zh'else['zero','one','two','three','four','five','six','seven','eight','nine']
 text=''.join(digits[int(c)]if c.isascii()and c.isdigit()else c for c in text).lower().replace('两','二').replace('〇','零')
 return ''.join(c for c in text if c.isalnum())
def parts(text):return [p.strip()for p in re.findall(r'[^，。！？,.;!?]+[，。！？,.;!?]*\s*',text)if p.strip()]
def phrase_key(item,text):return identity([item['language'],item['actor'],item['role'],normalized(text),'end'if re.search(r'[。！？.!?]\s*$',text)else'continue'])[:24]
def pcm(item):
 data=subprocess.check_output(['ffmpeg','-v','error','-threads','1','-filter_threads','1','-i',str(ROOT/'public'/item['file']),'-ar',str(RATE),'-ac','1','-f','s16le','-'])
 return np.frombuffer(data,dtype='<i2').astype(np.float64)/32768
def trim(x):
 step=120;energies=np.array([np.sqrt(np.mean(x[i:i+step]**2))for i in range(0,len(x),step)]);active=np.where(energies>.0025)[0]
 if not len(active):raise ValueError('Silent source')
 a=max(0,active[0]*step-360);b=min(len(x),(active[-1]+1)*step+360);x=x[a:b].copy();f=min(120,len(x)//12);x[:f]*=np.linspace(0,1,f);x[-f:]*=np.linspace(1,0,f);return x
class Author:
 def __init__(self):self.models={};self.library={};self.review=[];self.count=0
 def words(self,item,x,model):
  cache=WORK/(item['sha256']+'-'+model+'-alignment.json')
  if cache.exists():return json.loads(cache.read_text())
  if model not in self.models:self.models[model]=WhisperModel(model,device='cpu',compute_type='int8',cpu_threads=2)
  # Decode through FFmpeg above; the model receives 16 kHz PCM directly.
  data=subprocess.check_output(['ffmpeg','-v','error','-threads','1','-i',str(ROOT/'public'/item['file']),'-ar','16000','-ac','1','-f','f32le','-'])
  segments,_=self.models[model].transcribe(np.frombuffer(data,dtype='<f4'),language=item['language'],initial_prompt=item['text'],word_timestamps=True,beam_size=1,condition_on_previous_text=False,vad_filter=False)
  words=[{'text':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)}for s in segments for w in(s.words or[])];cache.write_text(json.dumps(words,ensure_ascii=False)+'\n');return words
 def align(self,item,x,model):
  words=self.words(item,x,model);actual='';times=[]
  for w in words:
   text=normalized(w['text'],item['language']);actual+=text
   times.extend((w['start']+(w['end']-w['start'])*i/len(text),w['start']+(w['end']-w['start'])*(i+1)/len(text))for i in range(len(text)))
  target=normalized(item['text'],item['language']);matcher=difflib.SequenceMatcher(None,target,actual,autojunk=False);mapping={a+i:b+i for a,b,n in matcher.get_matching_blocks()for i in range(n)}
  # Ignore ASR tail hallucinations when all actual requested words are mapped.
  coverage=len(mapping)/len(target)
  if coverage<.86:return None,{'coverage':coverage,'actual':actual,'reason':'word coverage'}
  offsets=np.cumsum([len(normalized(t,item['language']))for t in item['parts']])[:-1];cuts=[0.];details=[]
  for offset in offsets:
   before=max((p for p in mapping if p<offset),default=-1);after=min((p for p in mapping if p>=offset),default=len(target))
   if before<offset-2 or after>offset+1 or before<0 or after>=len(target):return None,{'coverage':coverage,'actual':actual,'reason':'uncertain phrase boundary'}
   left=times[mapping[before]][1];right=times[mapping[after]][0];predicted=(left+right)/2
   if left>right+.06 or predicted-cuts[-1]<.16 or predicted>len(x)/RATE-.12:return None,{'coverage':coverage,'actual':actual,'reason':'invalid phrase timing'}
   # Prefer a real pause between the surrounding words. A narrow energy search
   # handles brisk delivery; never wander into the next word to find silence.
   radius=min(.085,max(.025,(right-left)/2));a=max(round((predicted-radius)*RATE),round((cuts[-1]+.12)*RATE),0);b=min(round((predicted+radius)*RATE),len(x)-240)
   if b<=a:return None,{'coverage':coverage,'actual':actual,'reason':'no boundary window'}
   candidates=[(k,float(np.sqrt(np.mean(x[k:k+240]**2))))for k in range(a,b,24)];center,energy=min(candidates,key=lambda t:t[1]);center+=120
   z0=max(a,center-36);z1=min(len(x),center+36);cut=(z0+int(np.argmin(np.abs(x[z0:z1]))))/RATE
   if energy>.06:return None,{'coverage':coverage,'actual':actual,'reason':'voiced boundary','rms':energy}
   cuts.append(cut);details.append({'offset':int(offset),'predicted':predicted,'cut':cut,'rms':energy})
  cuts.append(len(x)/RATE);return cuts,{'coverage':coverage,'actual':actual,'cuts':details}
 def extract(self,item):
  x=pcm(item);cuts,report=self.align(item,x,'tiny')
  if cuts is None:cuts,report=self.align(item,x,'base')
  self.count+=1
  if cuts is None:self.review.append({'clip':item['clip'],'actor':item['actor'],'language':item['language'],**report});print('WHOLE',item['language'],item['actor'],item['clip'],report['reason'],flush=True);return
  for n,text in enumerate(item['parts']):
   key=phrase_key(item,text)
   if key in self.library:continue
   a,b=cuts[n:n+2];data=trim(x[round(a*RATE):round(b*RATE)])
   if len(data)<RATE*.07:continue
   raw=np.round(np.clip(data,-.98,.98)*32767).astype('<i2').tobytes();temporary=OUT/(key+'.tmp.wav')
   with wave.open(str(temporary),'wb')as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(raw)
   digest=hashlib.sha256(temporary.read_bytes()).hexdigest();name=key+'-'+digest[:12]+'.wav';temporary.rename(OUT/name)
   self.library[key]={'file':'assets/radio/phrases/v1/'+name,'sha256':digest,'text':text,'language':item['language'],'actor':item['actor'],'role':item['role'],'duration':len(data)/RATE,'frames':len(data),'bytes':44+len(raw),'peak':float(np.max(np.abs(data))),'rms':float(np.sqrt(np.mean(data**2))),'source':{'file':item['file'],'sha256':item['sha256'],'clip':item['clip'],'start':a,'end':b}}
  print('CUT',self.count,item['language'],item['actor'],item['clip'],'phrases',len(self.library),flush=True)
def main():
 source=json.loads((WORK/'sources.json').read_text());author=Author();canonical={};records=[]
 for item in source:
  item['parts']=parts(item['text']);item['keys']=[phrase_key(item,p)for p in item['parts']];key=(item['language'],item['actor'],item['role'],normalized(item['text']));canonical.setdefault(key,item);records.append(item)
 existing=ROOT/'game/src/comms/phrase-catalogue.json'
 if existing.exists():
  prior=json.loads(existing.read_text());expectedKeys={k for i in records for k in i['keys']};sourceHashes={i['sha256']for i in records}
  for key,entry in prior['phrases'].items():
   path=ROOT/'public'/entry['file']
   if key in expectedKeys and(entry['source']['sha256']in sourceHashes or entry['source'].get('approval'))and path.exists()and hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']:author.library[key]=entry
  print('REUSE',len(author.library),'verified existing phrases',flush=True)
 pending=list(canonical.values())
 while pending:
  # Cover the common phrases first, then process only context takes that add
  # missing phrases. Identical location-independent lines never need recutting.
  counts={}
  for i in pending:
   for key in i['keys']:counts[key]=counts.get(key,0)+1
  item=max(pending,key=lambda i:sum(counts[k]for k in i['keys']if k not in author.library))
  pending.remove(item)
  if all(k in author.library for k in item['keys']):continue
  if len(item['parts'])<2:continue
  author.extract(item)
 clips={};assembled=0
 for item in records:
  key=item['language']+':'+item['actor']+':'+item['clip'];canonicalItem=canonical[(item['language'],item['actor'],item['role'],normalized(item['text']))]
  group=item.get('group',next((p for p in ['lga','lax','jfk','daxing','kansai','changi','xiaoshan','ground','airline']if item['clip'].startswith(p+'-')),'training'))
  plan={'text':item['text'],'group':group,'role':item['role'],'language':item['language'],'actor':item['actor'],'source':{'file':canonicalItem['file'],'sha256':canonicalItem['sha256'],'duration':canonicalItem['duration']},'parts':[],'gapMs':90 if item['language']=='zh'else 70}
  if len(item['keys'])>=2 and all(k in author.library for k in item['keys']):
   plan['parts']=item['keys'];plan['duration']=sum(author.library[k]['duration']for k in item['keys'])+(len(item['keys'])-1)*plan['gapMs']/1000;assembled+=1
  else:plan['duration']=canonicalItem['duration']
  # The original same-speaker recording is a complete fallback while a phrase
  # is unavailable. Reserve enough queue time for either performance.
  plan['budget']=max(plan['duration'],item['duration'],canonicalItem['duration']);clips[key]=plan
 used={p for c in clips.values()for p in c['parts']};library={k:v for k,v in author.library.items()if k in used};pack={'schema':1,'sampleRate':RATE,'phrases':library,'clips':clips};pack['fingerprint']=identity(pack)
 (ROOT/'game/src/comms/phrase-catalogue.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n');(WORK/'review.json').write_text(json.dumps(author.review,ensure_ascii=False,indent=2)+'\n');print('PACK',assembled,'/',len(clips),'assembled;',len(library),'unique phrases;',len(author.review),'uncertain sources retained',flush=True)
if __name__=='__main__':main()
