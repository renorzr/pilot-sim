// GPU-only geometry fixtures: these do not modify a live aircraft or mission.
import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {connect}from './cdp.mjs';
const mode=process.argv[2]||'verify',b=await connect('http://127.0.0.1:18083/',640,400);
try{
 await b.waitFor('!!window.__flightSim',60000);
 const results=await b.evaluate(`(async()=>{
 const THREE=await import('/node_modules/.vite/deps/three.js');
 const {buildDaxingWorld}=await import('/src/airports/daxing-world.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#333333');scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,2));
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,logarithmicDepthBuffer:false});renderer.setSize(320,180);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const host=document.createElement('div');host.style='position:fixed;inset:0;background:#111;z-index:10000;display:grid;place-items:center;grid-template-columns:1fr 1fr';host.appendChild(renderer.domElement);document.body.appendChild(host);
 const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,...extra});
 buildDaxingWorld({scene,mat});
 scene.traverse(o=>{const hex=o.material?.color?.getHexString();if(hex==='d1b35a')o.material.color.set('#ff00ff');if(hex==='e6e5d9')o.material.color.set('#00ffff');});
 const camera=new THREE.PerspectiveCamera(36,320/180,.7,30000);camera.rotation.order='YXZ';
 const gl=renderer.getContext(),pixels=new Uint8Array(320*180*4),count=(white=false)=>{gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let n=0;for(let i=0;i<pixels.length;i+=4)if(white?pixels[i+1]>150&&pixels[i+2]>150&&pixels[i]<80:pixels[i]>150&&pixels[i+2]>150&&pixels[i+1]<80)n++;return n;};
 const cases=[{id:'Y7',x:-500,z:-1015,yaw:Math.PI/2},{id:'hold',x:-110,z:-12.201,yaw:1.56},{id:'entry',x:-15,z:-75,yaw:.35},{id:'runway-entry',x:-5,z:-85,yaw:.18},{id:'runway-white',x:0,z:-175,yaw:0,white:true}];
 const results=[];for(const p of cases){const frames=[];for(const dy of[-.03,0,.03])for(const dp of[-.003,0,.003]){camera.position.set(p.x,2.8+dy,p.z);camera.rotation.set(-.021+dp,-p.yaw,0,'YXZ');renderer.render(scene,camera);frames.push(count(p.white));if(p.id==='entry'&&dy===0){const img=document.createElement('img');img.src=renderer.domElement.toDataURL();host.appendChild(img);}}results.push({id:p.id,pixels:frames});}
 // Verify actual scenery depth still occludes paint: an opaque wall between
 // cockpit and line must hide it, even with the late paint render order.
 camera.position.set(-500,2.8,-1015);camera.rotation.set(-.021,-Math.PI/2,0,'YXZ');renderer.render(scene,camera);const visible=count();
 const wall=new THREE.Mesh(new THREE.BoxGeometry(1,80,1000),mat('#222222'));wall.position.set(-495,20,-1015);scene.add(wall);renderer.render(scene,camera);results.push({id:'wall-occlusion',visible,occluded:count()});
 return results;
 })()`);
 await b.screenshot(`qa/markings-${mode}.png`);console.log(JSON.stringify(results,null,2));await writeFile(`qa/markings-${mode}.json`,JSON.stringify(results,null,2));
 if(mode!=='baseline'){
  for(const p of results.filter(x=>x.pixels)){assert(Math.min(...p.pixels)>5,`${p.id}: disappearing paint`);assert(Math.min(...p.pixels)/Math.max(...p.pixels)>.65,`${p.id}: unstable paint coverage`);}
  const wall=results.find(x=>x.id==='wall-occlusion');assert(wall.visible>5&&wall.occluded===0,'paint must remain hidden behind real objects');
 }
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);
}finally{await b.close();}
