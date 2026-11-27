import {siteUrl} from '../urls.js';
import {RADIO_PHRASES} from './phrases.js';

// PCM assembly keeps the original speech rate, one media clock and one VHF/PTT
// envelope. No per-fragment media swaps or decoding gaps occur during playback.
export function phrasePCM(bytes,expected){
 const view=new DataView(bytes),tag=at=>String.fromCharCode(...new Uint8Array(bytes,at,4));
 if(bytes.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('Invalid phrase WAV');
 let format=null,data=null;
 for(let offset=12;offset+8<=bytes.byteLength;){
  const name=tag(offset),length=view.getUint32(offset+4,true),start=offset+8;
  if(start+length>bytes.byteLength)throw Error('Truncated phrase WAV');
  if(name==='fmt '){if(length<16)throw Error('Invalid WAV format');format={codec:view.getUint16(start,true),channels:view.getUint16(start+2,true),rate:view.getUint32(start+4,true),bits:view.getUint16(start+14,true)};}
  if(name==='data')data=new Uint8Array(bytes,start,length);
  offset=start+length+(length&1);
 }
 if(!format||format.codec!==1||format.channels!==1||format.rate!==24000||format.bits!==16||!data||data.length!==expected.frames*2||bytes.byteLength!==expected.bytes)throw Error('Phrase format or identity mismatch');
 return data;
}
export function joinPhrasePCM(parts,gapMs,rate=24000){
 const gap=Math.round(gapMs/1000*rate)*2,length=parts.reduce((n,p)=>n+p.byteLength,0)+gap*Math.max(0,parts.length-1);
 if(!parts.length||!Number.isSafeInteger(length)||length>rate*2*120)throw Error('Invalid phrase recipe');
 const bytes=new ArrayBuffer(44+length),view=new DataView(bytes),str=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
 str(0,'RIFF');view.setUint32(4,36+length,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length,true);
 const output=new Uint8Array(bytes);let offset=44;
 parts.forEach((part,index)=>{output.set(part,offset);offset+=part.byteLength+(index<parts.length-1?gap:0);});return bytes;
}
export class PhraseAudioCache{
 constructor({fetcher=(...args)=>globalThis.fetch(...args),makeURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url),phrases=RADIO_PHRASES,maxPCMBytes=16*1024*1024,maxJoinedBytes=16*1024*1024,maxJoined=40}={}){
  Object.assign(this,{fetcher,makeURL,revokeURL,phrases,maxPCMBytes,maxJoinedBytes,maxJoined});this.pcm=new Map();this.joined=new Map();this.queue=[];this.queued=new Set();this.inflight=0;this.clock=0;this.active=null;this.closed=false;this.hits=0;this.downloads=0;this.failures=0;
 }
 ready(plan){const item=this.joined.get(plan.key);if(!item?.url)return null;item.used=++this.clock;this.hits++;return item.url;}
 protect(url){this.active=url;this.trim();}
 async part(id){
  let item=this.pcm.get(id);
  if(item){item.used=++this.clock;return item.promise;}
  const expected=this.phrases[id];if(!expected)throw Error('Unknown phrase');
  item={used:++this.clock,bytes:0};this.pcm.set(id,item);
  item.promise=(async()=>{this.downloads++;const response=await this.fetcher(siteUrl(`${expected.file}?v=${expected.sha256.slice(0,16)}`));if(!response.ok)throw Error('Phrase download failed');const bytes=await response.arrayBuffer(),data=phrasePCM(bytes,expected);item.bytes=bytes.byteLength;this.trim();return data;})().catch(error=>{if(this.pcm.get(id)===item)this.pcm.delete(id);throw error;});return item.promise;
 }
 prepare(plan){
  if(this.closed||!plan?.parts.length)return Promise.resolve(null);
  const existing=this.joined.get(plan.key);
  if(existing){existing.used=++this.clock;if(!existing.failedAt||Date.now()-existing.failedAt<15000)return existing.promise;this.joined.delete(plan.key);}
  const item={used:++this.clock,bytes:0};this.joined.set(plan.key,item);
  item.promise=Promise.all(plan.parts.map(id=>this.part(id))).then(parts=>{
   if(this.closed)return null;
   const bytes=joinPhrasePCM(parts,plan.gapMs);item.url=this.makeURL(new Blob([bytes],{type:'audio/wav'}));item.bytes=bytes.byteLength;this.trim();return this.joined.get(plan.key)===item?item.url:null;
  }).catch(error=>{this.failures++;this.lastError=error.message;item.failedAt=Date.now();this.trim();return null;});return item.promise;
 }
 warm(plans){
  if(this.closed)return;
  for(const plan of plans){const existing=plan&&this.joined.get(plan.key);if(!plan?.parts.length||existing&&(!existing.failedAt||Date.now()-existing.failedAt<15000)||this.queued.has(plan.key))continue;if(this.queue.length>=64)break;this.queue.push(plan);this.queued.add(plan.key);}
  this.pump();
 }
 pump(){
  while(!this.closed&&this.inflight<2&&this.queue.length){const plan=this.queue.shift();this.queued.delete(plan.key);this.inflight++;this.prepare(plan).finally(()=>{this.inflight--;this.pump();});}
 }
 trim(){
  for(const [map,limit,count]of[[this.pcm,this.maxPCMBytes,Infinity],[this.joined,this.maxJoinedBytes,this.maxJoined]]){
   let size=[...map.values()].reduce((n,v)=>n+v.bytes,0);
   for(const [key,item]of[...map].sort((a,b)=>a[1].used-b[1].used)){
    if(size<=limit&&map.size<=count)break;
    if(!item.bytes&&!item.failedAt||item.url&&item.url===this.active)continue;
    if(item.url)this.revokeURL(item.url);map.delete(key);size-=item.bytes;
   }
  }
 }
 stats(){return{phrases:this.pcm.size,joined:this.joined.size,pcmBytes:[...this.pcm.values()].reduce((n,v)=>n+v.bytes,0),joinedBytes:[...this.joined.values()].reduce((n,v)=>n+v.bytes,0),queued:this.queue.length,inflight:this.inflight,hits:this.hits,downloads:this.downloads,failures:this.failures,lastError:this.lastError??null};}
 dispose(){this.closed=true;this.queue=[];this.queued.clear();for(const item of this.joined.values())if(item.url)this.revokeURL(item.url);this.joined.clear();this.pcm.clear();}
}
