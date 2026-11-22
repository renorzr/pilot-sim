import data from './data/lax-city-physics.json' with {type:'json'};
import {LAX}from './registry.js';
import {surfaceHeight}from '../terrain/heightfield.js';
import {landmarkEnvelopes}from './lax-city-landmarks.js';

// One compact, source-derived layout feeds rendering, camera and flight contact.
// Geometry and atlas data load separately, only when entering the LAX world.
let cached;
export function cityLayout(airport='lax'){
 const id=typeof airport==='string'?airport:airport?.airportId;
 if(id!=='lax')return{buildings:[],landmarks:[],all:[]};
 if(!cached){
  const heightAt=(x,z)=>surfaceHeight(x,z,'lax');
  const buildings=data.buildings.map(b=>{const angle=b.angle||0,co=Math.cos(angle),si=Math.sin(angle),gradeY=heightAt(b.cx,b.cz),baseY=Math.min(gradeY,...[[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5]].map(([u,v])=>heightAt(b.cx+u*b.width*co-v*b.depth*si,b.cz+u*b.width*si+v*b.depth*co)))-.05,topY=gradeY+b.height;return{...b,baseY,topY,height:topY-baseY,angle};});
  const landmarks=landmarkEnvelopes({project:LAX.project,heightAt,landmarks:data.landmarks}).map(b=>({...b,angle:0,kind:'landmark'}));
  cached={buildings,landmarks,all:[...buildings,...landmarks]};
 }
 return cached;
}
