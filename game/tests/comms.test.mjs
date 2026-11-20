import test from 'node:test';import assert from 'node:assert/strict';
import{CommsPlayback}from'../src/comms/playback.js';
class Media{
 constructor(){this.paused=true;this.ended=false;this.currentTime=0;this.duration=4;this.readyState=4;this.src='';}
 play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}get currentSrc(){return this.src;}
}
globalThis.Audio=Media;
test('urgent terrain speech cannot be interrupted by a lower-priority height cue',()=>{
 const p=new CommsPlayback();p.update({time:1},true,false);assert(p.say('Terrain, terrain, pull up'));const src=p.callout.src;assert(p.say('Twenty, retard'));assert.equal(p.callout.src,src);assert.equal(p.calloutPriority,3);p.dispose();
});
test('pause resumes a current terrain alert, but unmuting does not replay a stale warning',async()=>{
 const p=new CommsPlayback();p.update({time:1},true,false);p.say('Terrain, terrain, pull up');p.callout.currentTime=1;await new Promise(resolve=>setImmediate(resolve));
 p.update({time:2},false,false);assert(p.callout.paused);p.update({time:2},true,false);assert(!p.callout.paused);assert.equal(p.callout.currentTime,1);
 p.update({time:2},true,true);assert(p.callout.paused);p.update({time:12},true,false);assert(p.callout.paused);p.dispose();
});

test('a delayed frame or resumed transmission does not repeatedly seek an active MP3',async()=>{
 const p=new CommsPlayback(),s={time:1,radio:{active:{id:1,clip:'circuit-takeoff-0',started:0}}};p.update(s,true,false);await new Promise(resolve=>setImmediate(resolve));
 p.radio.currentTime=1;const src=p.radio.src;s.time=4;p.update(s,true,false);assert.equal(p.radio.currentTime,1);assert.equal(p.radio.src,src);
 p.update(s,false,false);assert(p.radio.paused);p.update(s,true,false);assert(!p.radio.paused);assert.equal(p.radio.currentTime,1);p.dispose();
});


test('stall speech has priority, ducks radio, pauses/mutes and stops immediately on recovery',async()=>{
 const p=new CommsPlayback(),s={time:1,stallWarning:{active:true}};p.update(s,true,false);assert(p.say('Stall, stall'));assert.equal(p.calloutPriority,4);const src=p.callout.src;p.say('Five hundred');assert.equal(p.callout.src,src);await new Promise(r=>setImmediate(r));
 p.update(s,true,false);assert.equal(p.radio.volume,.15);p.update(s,false,false);assert(p.callout.paused);p.update(s,true,false);assert(!p.callout.paused);p.update(s,true,true);assert(p.callout.paused);
 s.stallWarning.active=false;p.update(s,true,false);assert(p.callout.paused&&!p.callout.src);p.dispose();
});


test('a pilot declaration is not covered by ordinary height speech, while critical cockpit warnings still take priority',()=>{
 const p=new CommsPlayback();p.update({time:1,radio:{active:{id:1,clip:'dual-0',started:1,emergency:'distress',role:'pilot'}}},true,false);assert(p.say('One thousand'));assert.equal(p.callout.src,'');assert(p.say('Autopilot off'));assert(p.callout.src.includes('call-ap-off'));assert(p.say('Terrain, terrain, pull up'));assert.equal(p.calloutPriority,3);p.dispose();
});
