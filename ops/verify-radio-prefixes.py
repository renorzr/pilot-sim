"""Verify three actual English signal units in staged MP3 waveforms."""
import sys,pathlib,json,hashlib,subprocess,numpy as np
root=pathlib.Path(__file__).resolve().parents[1];stage=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else root/'qa/radio-phraseology')
english=len(sys.argv)>2 and sys.argv[2]=='en'
# Parse the generator's literal pilot profile instead of duplicating it here.
import ast
tree=ast.parse((root/'ops/generate-radio.py').read_text())
profiles_list=[ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PROFILES' for t in n.targets)]
profiles=profiles_list[-1] if english else profiles_list[0]
profile=profiles['pilot']
render=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SIGNAL_RENDER' for t in n.targets))
def decode(path,filters=None):
 command=['ffmpeg','-v','error','-i',str(path)]
 if filters:command+=['-af',filters]
 return np.frombuffer(subprocess.check_output(command+['-f','f32le','-ac','1','-ar','24000','-']),dtype='<f4').astype('float64')
result={}
for prefix,unit in [('MAYDAY, MAYDAY, MAYDAY.','Mayday.'),('PAN PAN, PAN PAN, PAN PAN.','Pan pan.')]:
 raw=pathlib.Path('/tmp')/('pilot-radio-signal-'+hashlib.sha256((unit+json.dumps(profile,sort_keys=True)).encode()).hexdigest()[:16]+'.mp3')
 ref=decode(raw,render['filter']+',highpass=f=300,lowpass=f=3300');n=len(ref)
 for key,lines in json.loads((root/('game/src/comms/script.en.json' if english else 'game/src/comms/script.json')).read_text()).items():
  if not lines[0][1].startswith(prefix):continue
  full=decode(stage/'radio'/('en' if english else '')/(key+'-0.mp3'))[:n*3+24000]
  size=1<<(len(full)+n-1).bit_length();cor=np.fft.irfft(np.fft.rfft(full,size)*np.conj(np.fft.rfft(ref,size)),size)[:len(full)-n+1]
  power=np.r_[0,np.cumsum(full*full)];energy=power[n:]-power[:-n]
  corr=cor/np.maximum(np.linalg.norm(ref)*np.sqrt(np.maximum(energy,0)),1e-15);peaks=[]
  for i in range(3):
   p=int(np.argmax(corr));score=float(corr[p]);assert score>.93,(key,i,score);peaks.append({'seconds':round(p/24000,3),'correlation':round(score,5)});corr[max(0,p-n//2):min(len(corr),p+n//2)]=-1
  peaks.sort(key=lambda p:p['seconds']);gaps=np.diff([p['seconds'] for p in peaks]);assert np.max(np.abs(gaps-(n/24000+render['gap'])))<.03,(key,gaps,n/24000)
  result[key]={'signal':unit,'spokenUnits':3,'profile':profile,'render':render,'unitDuration':round(n/24000,6),'prefixEnd':round(peaks[-1]['seconds']+n/24000,3),'matches':peaks}
assert len(result)==7,len(result)
assert all(x['prefixEnd']<2.5 for x in result.values()),'Declaration cadence is too slow'
(stage/('prefix-verification.en.json' if english else 'prefix-verification.json')).write_text(json.dumps(result,indent=2)+'\n');print('Verified three waveform matches in all',len(result),'declarations; PAN PAN is a complete repeated unit.')
