import argparse, asyncio, array, hashlib, json, math, pathlib, subprocess
import edge_tts
ROOT=pathlib.Path(__file__).resolve().parents[1]
PROFILES={
 'zh':{'tower':{'voice':'zh-CN-XiaoxiaoNeural','rate':'+24%','pitch':'-12Hz'},'pilot':{'voice':'zh-CN-YunxiNeural','rate':'+26%','pitch':'-18Hz'}},
 'en':{'tower':{'voice':'en-US-AriaNeural','rate':'+22%','pitch':'-6Hz'},'pilot':{'voice':'en-US-GuyNeural','rate':'+24%','pitch':'-10Hz'}},
}
FILTER='highpass=f=300,lowpass=f=3300,loudnorm=I=-18:TP=-2:LRA=7'
EN_DIGITS={'0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine'}
ZH_DIGITS={'0':'零','1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九'}
EN_LETTERS=dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ','Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split()))
ZH_LETTERS={'A':'阿尔法','B':'布拉沃','C':'查理','D':'德尔塔','E':'埃科','F':'福克斯特罗特','G':'高尔夫','H':'霍特尔','J':'朱丽叶','K':'基洛'}
def make_script(stand,runway):
 rz=''.join({'L':'左','R':'右','C':'中'}.get(c,ZH_DIGITS.get(c,c)) for c in runway.upper())
 re=' '.join({'L':'left','R':'right','C':'center'}.get(c,EN_DIGITS.get(c,c)) for c in runway.upper())
 sz=''.join(ZH_DIGITS.get(c,ZH_LETTERS.get(c,c)) for c in stand.upper())
 se=' '.join(EN_DIGITS.get(c,EN_LETTERS.get(c,c)) for c in stand.upper())
 zh={
 'preparation':[['pilot',f'肯尼迪地面，云际三二零，{sz}机位，请求推出开车。'],['tower','云际三二零，同意推出开车，完成后报告。']],
 'taxi':[['tower',f'云际三二零，沿指示路线滑行至{rz}跑道外等待。'],['pilot',f'沿指示路线滑行，{rz}跑道外等待，云际三二零。']],
 'holding':[['pilot',f'云际三二零，{rz}跑道外等待点，已停稳。'],['tower','云际三二零，联系塔台，继续跑道外等待。']],
 'lineup':[['tower',f'云际三二零，{rz}，进跑道等待。'],['pilot',f'{rz}，进跑道等待，云际三二零。']],
 'ground-speed':[['tower','云际三二零，滑行速度过快，减速。'],['pilot','减速滑行，云际三二零。']],
 'ground-stop':[['tower','云际三二零，尚未许可进入跑道，立即停住。'],['pilot','收到，立即停止，云际三二零。']],
 'takeoff':[['tower',f'云际三二零，肯尼迪塔台，跑道{rz}，可以起飞。'],['pilot',f'跑道{rz}，可以起飞，云际三二零。']],
 'approach':[['pilot',f'肯尼迪塔台，云际三二零，进近{rz}。'],['tower',f'云际三二零，肯尼迪塔台，继续进近{rz}，检查速度和构型。']],
 'reapproach':[['tower',f'云际三二零，按导航左转返场，准备再次进近{rz}。'],['pilot',f'左转返场，准备再次进近{rz}，云际三二零。']],
 'final':[['pilot',f'肯尼迪塔台，云际三二零，{rz}五边。'],['tower',f'云际三二零，跑道{rz}，可以着陆。']],
 }
 en={
 'preparation':[['pilot',f'Kennedy Ground, Skyline three two zero, stand {se}. Request pushback and start.'],['tower','Skyline three two zero, pushback and start approved. Report when ready.']],
 'taxi':[['tower',f'Skyline three two zero, taxi via the marked route. Hold short of runway {re}.'],['pilot',f'Taxi via the marked route. Hold short of {re}, Skyline three two zero.']],
 'holding':[['pilot',f'Skyline three two zero, stopped at the holding point, runway {re}.'],['tower','Skyline three two zero, contact Tower. Continue holding short.']],
 'lineup':[['tower',f'Skyline three two zero, runway {re}, line up and wait.'],['pilot',f'{re.capitalize()}, line up and wait, Skyline three two zero.']],
 'ground-speed':[['tower','Skyline three two zero, taxi speed excessive. Reduce speed.'],['pilot','Reducing taxi speed, Skyline three two zero.']],
 'ground-stop':[['tower','Skyline three two zero, not cleared to enter the runway. Stop immediately.'],['pilot','Stopping immediately, Skyline three two zero.']],
 'takeoff':[['tower',f'Skyline three two zero, Kennedy Tower. Runway {re}, cleared for takeoff.'],['pilot',f'Runway {re}, cleared for takeoff, Skyline three two zero.']],
 'approach':[['pilot',f'Kennedy Tower, Skyline three two zero, approaching runway {re}.'],['tower',f'Skyline three two zero, Kennedy Tower. Continue approach runway {re}. Check speed and configuration.']],
 'reapproach':[['tower',f'Skyline three two zero, turn left following navigation for another approach, runway {re}.'],['pilot',f'Left turn for another approach, runway {re}, Skyline three two zero.']],
 'final':[['pilot',f'Kennedy Tower, Skyline three two zero, final runway {re}.'],['tower',f'Skyline three two zero, runway {re}, cleared to land.']],
 }
 return zh,en
SEM=asyncio.Semaphore(3)
async def clip(language,event,index,role,text):
 async with SEM:
  ident=f'jfk-{event}-{index}'
  folder=ROOT/'public/assets/radio'/('en' if language=='en' else '')
  folder.mkdir(parents=True,exist_ok=True);target=folder/(ident+'.mp3')
  identity=json.dumps({'text':text,'profile':PROFILES[language][role],'filter':FILTER},ensure_ascii=False,sort_keys=True)
  raw=pathlib.Path('/tmp')/('pilot-ground-'+hashlib.sha256(identity.encode()).hexdigest()[:20]+'.mp3')
  if not raw.exists() or raw.stat().st_size<1000:
   for attempt in range(4):
    try:
     await asyncio.wait_for(edge_tts.Communicate(text,**PROFILES[language][role]).save(str(raw)),40);break
    except Exception as e:
     if attempt==3:raise
     print('RETRY',ident,attempt,str(e),flush=True);await asyncio.sleep(attempt+1)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-af',FILTER,'-ar','24000','-ac','1','-b:a','48k',str(target)],check=True)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels,bit_rate','-of','json',str(target)]))
  duration=float(probe['format']['duration']);stream=probe['streams'][0]
  assert stream['codec_name']=='mp3' and stream['sample_rate']=='24000' and stream['channels']==1
  assert target.stat().st_size>1000 and .5<duration<20
  pcm=array.array('h',subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','s16le','-acodec','pcm_s16le','-']))
  peak=max(abs(v) for v in pcm)/32768;rms=math.sqrt(sum(v*v for v in pcm)/len(pcm))/32768
  assert .01<peak<.99 and rms>.003,(ident,peak,rms)
  print(language,ident,round(duration,3),'peak',round(peak,4),'rms',round(rms,4),flush=True)
  return language,ident,round(duration,3)
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--stand');parser.add_argument('--runway',required=True);parser.add_argument('--partial',action='store_true');args=parser.parse_args()
 assert args.stand or args.partial,'real stand ref required'
 zh,en=make_script(args.stand or 'PENDING',args.runway)
 jobs=[clip(language,event,index,role,text) for language,script in [('zh',zh),('en',en)] for event,lines in script.items() for index,(role,text) in enumerate(lines) if not(args.partial and event=='preparation' and index==0)]
 results=await asyncio.gather(*jobs)
 if args.partial:return
 durations={'zh':{},'en':{}}
 for language,ident,duration in results:durations[language][ident]=duration
 version=hashlib.sha256(json.dumps({'zh':zh,'en':en,'profiles':PROFILES,'filter':FILTER},ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:20]
 output={'zh':zh,'en':en,'durations':durations,'version':version}
 (ROOT/'game/src/comms/jfk-radio.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 print('PACK jfk VERSION',version,'CLIPS',len(results),flush=True)
 for event in zh:print('EVENT',event,{language:round(sum(durations[language][f'jfk-{event}-{i}'] for i in range(len(zh[event]))),3) for language in durations},flush=True)
if __name__=='__main__':asyncio.run(main())
