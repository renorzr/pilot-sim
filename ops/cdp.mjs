import { mkdir,writeFile } from 'node:fs/promises';
const CDP_ENDPOINT=process.env.PILOT_CDP_URL||'http://127.0.0.1:19333';
export async function connect(url='http://127.0.0.1:18083/', width=1586, height=992,existingTarget=null) {
 await mkdir(new URL('../qa/',import.meta.url),{recursive:true});
 const target=existingTarget?(await(await fetch(CDP_ENDPOINT+'/json/list')).json()).find(t=>t.id===existingTarget):await (await fetch(CDP_ENDPOINT+'/json/new?about:blank',{method:'PUT'})).json();if(!target)throw new Error('Browser target missing');
 const ws=new WebSocket(target.webSocketDebuggerUrl), pending=new Map(), events=[];let id=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.addEventListener('message',e=>{const data=JSON.parse(e.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}else events.push(data);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
 await send('Page.bringToFront');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 if(!existingTarget)await send('Page.navigate',{url});
 return {send,evaluate,events,target,
  async waitFor(expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('Browser condition timed out: '+expression);},
  async screenshot(path){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path,Buffer.from(result.data,'base64'));},
  async click(selector){const bounds=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Element missing');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...bounds,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...bounds,button:'left',clickCount:1});},
  async key(code,key,type='keyDown'){await send('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:({ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,Space:32,KeyW:87,KeyS:83,KeyG:71,KeyF:70,KeyP:80,KeyR:82,Escape:27,ShiftLeft:16,ShiftRight:16})[code]});},
  async close(){ws.close();await fetch(CDP_ENDPOINT+'/json/close/'+target.id);}
 };
}
