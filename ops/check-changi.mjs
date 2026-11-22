// Visual fixture uses the real airport world and changes only the inspection camera.
import assert from 'node:assert/strict';
import {connect} from './cdp.mjs';
import {writeFile} from 'node:fs/promises';
const b=await connect('http://127.0.0.1:18083/',1000,660);
try{
 await b.waitFor('!!window.__flightSim',60000);
 const stats=await b.evaluate(`(async()=>{
 const THREE=await import('/node_modules/.vite/deps/three.js'),{buildRealAirportWorld}=await import('/src/airports/real-airport-world.js'),{CHANGI}=await import('/src/airports/registry.js'),{departureOf}=await import('/src/missions/ground.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#adc9d7');scene.add(new THREE.HemisphereLight(0xffffff,0xb1b7aa,2));const sun=new THREE.DirectionalLight(0xfff1d3,2.5);sun.position.set(-3000,8000,1500);scene.add(sun);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,660);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 document.body.innerHTML='';document.body.appendChild(renderer.domElement);const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,...extra});
 buildRealAirportWorld({scene,mat,airport:CHANGI,departurePlan:departureOf('changi')});
 const camera=new THREE.PerspectiveCamera(44,1000/660,1,60000),center=CHANGI.project(103.9893,1.3560);camera.position.set(center.x+2200,2300,center.z+2600);camera.lookAt(center.x,0,center.z);renderer.render(scene,camera);
 const seaMeshes=[];scene.traverse(o=>{if(o.name==='sea-surface')seaMeshes.push(o)});scene.updateMatrixWorld(true);const seaHits=[[103.98,1.30,true],[104.08,1.33,true],[103.994,1.35,false],[103.96,1.415,false],[103.85,1.29,false]].map(([lon,lat,expected])=>{const p=CHANGI.project(lon,lat),hit=new THREE.Raycaster(new THREE.Vector3(p.x,10000,p.z),new THREE.Vector3(0,-1,0)).intersectObjects(seaMeshes).length>0;if(hit!==expected)throw new Error('Sea holes mismatch '+lon+','+lat);return{lon,lat,hit}});const holdingSign=scene.getObjectByName('runway-holding-sign');if(holdingSign.rotation.y<=0)throw new Error('Right-side holding sign must face the taxiing aircraft');window.inspection={renderer,scene,camera,CHANGI,holdingSign};return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,objects:scene.children.length,seaHits};})()`);
 await b.screenshot('qa/changi-preview.png');
 await b.evaluate(`(()=>{const {renderer,scene,camera,CHANGI}=window.inspection,c=CHANGI.project(103.9893,1.36);camera.position.set(c.x+650,600,c.z+780);camera.lookAt(c.x,0,c.z);renderer.render(scene,camera)})()`);await b.screenshot('qa/changi-terminal-preview.png');
 await b.evaluate(`(()=>{const {renderer,scene,camera,holdingSign:s}=window.inspection;camera.position.set(s.position.x+16,3,s.position.z);camera.lookAt(s.position);renderer.render(scene,camera)})()`);await b.screenshot('qa/changi-holding-sign.png');
 assert(stats.triangles>50000);assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);console.log(stats);await writeFile('qa/changi-scene-browser.json',JSON.stringify(stats,null,2));
}finally{await b.close();}
