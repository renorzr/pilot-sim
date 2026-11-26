import test from'node:test';import assert from'node:assert/strict';
import{FailureAudio}from'../src/audio/failure-audio.js';
class FakeAudio{constructor(){this.readyState=3;this.currentTime=0;this.paused=true;this.ended=false;this.playbackRate=1;this.src='';}get currentSrc(){return this.src;}load(){if(!this.src)this.currentTime=0;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}}
const plan=id=>({id,key:id,src:'https://example.invalid/'+id+'.mp3',active:true,paused:false,started:true,elapsed:0,asset:{duration:10,events:[]}});
test('one media source pauses/resumes at its offset, never loops and stops immediately on retry',async()=>{
 const old=globalThis.Audio;globalThis.Audio=FakeAudio;try{const a=new FailureAudio(),p=plan('a');a.update(p);await Promise.resolve();assert(!a.media.paused);assert.equal(a.sourceChanges,1);assert.equal(a.media.playbackRate,1);a.media.currentTime=3.1;p.elapsed=3.1;p.paused=true;a.update(p);assert(a.media.paused);assert.equal(a.state().elapsed,3.1);p.paused=false;a.update(p);await Promise.resolve();assert(!a.media.paused&&a.media.currentTime===3.1);assert.equal(a.sourceChanges,1);a.stop();assert(a.media.paused&&!a.media.src);assert.equal(a.stats().activeVoices.length,0);a.update({...p,active:false});assert.equal(a.sourceChanges,1);}finally{globalThis.Audio=old;}
});
test('unmute seeks to the current sequence time and cannot replay an old announcement',async()=>{
 const old=globalThis.Audio;globalThis.Audio=FakeAudio;try{const a=new FailureAudio(),p=plan('b');a.update(p);await Promise.resolve();p.elapsed=5;a.update(p,{muted:true});assert(a.media.paused&&a.media.muted);p.elapsed=7;a.update(p);await Promise.resolve();assert.equal(a.media.currentTime,7);assert(!a.media.muted);assert.equal(a.sourceChanges,1);}finally{globalThis.Audio=old;}
});
test('an aborted old playback promise cannot block or restart a later result',async()=>{
 const old=globalThis.Audio;globalThis.Audio=FakeAudio;try{const a=new FailureAudio();let reject;a.media.play=()=>new Promise((_,r)=>{reject=r;});a.update(plan('old'));a.stop();a.media.play=FakeAudio.prototype.play;a.update(plan('new'));reject(Object.assign(new Error('old aborted'),{name:'AbortError'}));await Promise.resolve();await Promise.resolve();assert.equal(a.id,'new');assert(!a.pending&&!a.blocked);}finally{globalThis.Audio=old;}
});
