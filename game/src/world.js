import {sampleCabinMotion} from './sim/cabin-motion.js';
import * as THREE from 'three';
import {t,subscribeLanguage} from './i18n/index.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RUNWAY } from './sim/constants.js';
import {TERRAIN,vertexHeight,coastline} from './terrain/heightfield.js';

const rand = (seed) => { let n = seed; return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; }; };

export function createWorld(host, onReady, onError) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    onError('当前浏览器无法启动 3D 画面，请开启硬件加速或换用支持 WebGL 2 的浏览器。');
    return { update() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .88;
  host.appendChild(renderer.domElement);
  const label=()=>renderer.domElement.setAttribute('aria-label',t('实时 3D 机场外景'));
  label();const stopLanguage=subscribeLanguage(label);
  const scene = new THREE.Scene();
  let dirty = true, lastView = '',skyTexture=null;
  scene.background = new THREE.Color('#a4c6e0');
  scene.fog = new THREE.FogExp2('#bccfda', .000047);
  const camera = new THREE.PerspectiveCamera(36, 1, .7, 30000);
  camera.rotation.order = 'YXZ';
  const sun = new THREE.DirectionalLight('#fff0d7', 2.9);
  sun.position.set(-2000, 4000, 1500);
  const ambient=new THREE.HemisphereLight('#d5e9ff', '#77745b', 2.1);scene.add(sun,ambient);

  const loading = new THREE.LoadingManager();
  let loadError = false;
  loading.onLoad = () => { dirty = true; if (!loadError) onReady(); };
  loading.onError = (url) => { loadError = true; onError('场景素材加载失败，请刷新页面重试。'); console.error('Asset load failed:', url); };
  const loader = new THREE.TextureLoader(loading);
  function texture(url, repeatX = 1, repeatY = 1) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return t;
  }
  const asphalt = texture('/assets/asphalt.jpg', 4, 150);
  const grass = texture('/assets/grass.jpg', 220, 700);
  loader.load('/assets/sky.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    skyTexture=t;scene.background = t;
    scene.backgroundIntensity = .9;
    scene.environment = t;
    scene.environmentIntensity = .35;
  });
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .88, ...options });
  const white = mat('#e1e0d9');
  const concrete = mat('#b4b5af');
  const navyGlass = mat('#60777e', { roughness: .25, metalness: .55 });
  const darkRoof = mat('#798387', { roughness: .6, metalness: .3 });
  const markingMat = new THREE.MeshBasicMaterial({ color: '#e5e5d9' });
  function box(w, h, d, material, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    return mesh;
  }
  function ground(w, d, material, x, z, y = .02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  // One small coastal airport, with a smooth continuous terrain mesh. The flat
  // infield and runway use the same world coordinates as the flight model.
  const terrainGeo = new THREE.PlaneGeometry(TERRAIN.width,TERRAIN.depth,TERRAIN.columns,TERRAIN.rows);
  terrainGeo.rotateX(-Math.PI / 2);
  const vertices = terrainGeo.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    const coast=x-coastline(z),y=vertexHeight(x,z);
    vertices.setY(i, y);
    const variation = .96 + Math.sin(x / 280) * Math.cos(z / 470) * .06;
    color.set(coast < 120 ? '#c3b99a' : y > 500 ? '#a0a19a' : '#c4c5ab').multiplyScalar(variation);
    colors.push(color.r, color.g, color.b);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }));
  scene.add(terrain);
  ground(40000, 60000, new THREE.MeshPhysicalMaterial({ color: '#39798d', roughness: .22, metalness: .16, clearcoat: .8, clearcoatRoughness: .25 }), -20000, 0, TERRAIN.waterLevel);

  const runwayMat = new THREE.MeshStandardMaterial({ map: asphalt, color: '#c3c7c8', roughness: .94 });
  ground(72, RUNWAY.length + 100, mat('#a6a698', { map: asphalt }), 0, -RUNWAY.length / 2, .015);
  ground(RUNWAY.width, RUNWAY.length, runwayMat, 0, -RUNWAY.length / 2, .035);
  const taxiMap = texture('/assets/asphalt.jpg', 2, 90);
  const taxiMat = mat('#b1b2ad', { map: taxiMap });
  ground(25, 2300, taxiMat, 190, -1300, .025);
  ground(460, 620, concrete, 485, -1250, .025);
  for (const z of [-250, -1050, -2150]) ground(190, 22, taxiMat, 100, z, .03);
  for (const x of [-28, 28]) ground(.65, 2560, markingMat, x, -1300, .05);
  for (let z = -140; z > -2500; z -= 65) ground(1.1, 28, markingMat, 0, z, .055);
  for (const z of [-15, -2585]) {
    for (let x = -24; x <= 24; x += 6) if (Math.abs(x) > 3) ground(3.4, 36, markingMat, x, z - (z > -100 ? 14 : -14), .055);
  }
  for (const z of [-280, -450]) for (const x of [-17, 17]) ground(4, 32, markingMat, x, z, .06);
  for (const x of [-19, 19]) ground(6, 45, markingMat, x, -350, .06);
  // Runway numbers are a native painted sign texture, not decorative UI art.
  const numberCanvas = document.createElement('canvas'); numberCanvas.width = 256; numberCanvas.height = 256;
  const nc = numberCanvas.getContext('2d'); nc.fillStyle = '#e2e2d9'; nc.font = 'bold 190px sans-serif'; nc.textAlign = 'center'; nc.fillText('27', 128, 202);
  ground(20, 35, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(numberCanvas), transparent: true, depthWrite: false }), 0, -92, .07);
  const yellow = new THREE.MeshBasicMaterial({ color: '#d7ba59' });
  ground(.32, 2300, yellow, 190, -1300, .05);
  for (const z of [-250, -1050, -2150]) ground(190, .32, yellow, 100, z, .06);

  const lightGeo = new THREE.SphereGeometry(.48, 6, 4);
  const lightWhite = new THREE.MeshBasicMaterial({ color: '#fff4c9' });
  const lightGreen = new THREE.MeshBasicMaterial({ color: '#70e9a2' });
  for (let z = 0; z >= -2600; z -= 55) {
    for (const x of [-32, 32]) {
      const lamp = new THREE.Mesh(lightGeo, lightWhite); lamp.position.set(x, .6, z); scene.add(lamp);
    }
  }
  for (let x = -27; x <= 27; x += 4.5) {
    const lamp = new THREE.Mesh(lightGeo, lightGreen); lamp.position.set(x, .65, 4); scene.add(lamp);
  }
  for (let z = 60; z < 600; z += 60) {
    box(.3, 1.2, .3, darkRoof, 0, 0, z);
    for (const x of [-4, 0, 4]) { const lamp = new THREE.Mesh(lightGeo, lightWhite); lamp.position.set(x, 1.3, z); scene.add(lamp); }
  }
  // PAPI gives a visible approach cue without covering the windscreen.
  const papi = [];
  for (let i = 0; i < 4; i++) {
    box(1.5, .55, 1.1, white, -52 - i * 4, .15, -180);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .35), new THREE.MeshBasicMaterial({ color: i < 2 ? '#ff5544' : '#fff5ce' }));
    light.position.set(-52 - i * 4, .72, -179.4); scene.add(light); papi.push(light);
  }

  // Terminal: layered roof slabs, glass bands, mullions, jetways and aprons.
  box(270, 11, 70, concrete, 540, 0, -1390);
  box(272, 7, 72, navyGlass, 540, 6, -1390);
  box(282, 1.6, 80, white, 540, 13, -1390);
  box(230, 2, 38, darkRoof, 540, 14.6, -1390);
  for (let x = 411; x < 670; x += 12) box(.7, 12, .8, white, x, 0, -1353);
  for (let x = 445; x < 660; x += 68) {
    box(5, 3.5, 26, white, x, 3, -1339);
    box(8, 3.8, 7, navyGlass, x, 2.8, -1324);
    ground(28, .45, yellow, x, -1290, .06);
  }
  const tower = new THREE.Group(); tower.position.set(760, 0, -1510); scene.add(tower);
  box(12, 42, 12, concrete, 0, 0, 0, tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(13, 10, 8, 8), navyGlass); cab.position.y = 44; tower.add(cab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 1.5, 8), white); cap.position.y = 49; tower.add(cap);
  box(.35, 12, .35, darkRoof, 0, 49, 0, tower);
  for (let i = 0; i < 3; i++) {
    const z = -1850 - i * 140;
    box(100, 15, 65, mat('#bdc2bd'), 500, 0, z);
    box(83, 12, .4, navyGlass, 500, 0, z + 32.8);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(50, 50, 68, 18, 1, false, 0, Math.PI), darkRoof);
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.y = .25; roof.position.set(500, 15, z); scene.add(roof);
  }

  // Small static aircraft are geometry-native game models, with swept wings
  // and rounded fuselages rather than flat image billboards.
  function parkedAircraft(x, z) {
    const group = new THREE.Group(); group.position.set(x, 4.6, z); scene.add(group);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 27, 5, 12), white); body.rotation.x = Math.PI / 2; group.add(body);
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([-18,-.4,7, -2,-.4,-4, 2,-.4,-4, -18,-.4,7,2,-.4,-4,18,-.4,7, -18,-.4,7,18,-.4,7,2,-.4,3],3));
    wingGeo.computeVertexNormals();
    group.add(new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({color:'#d4d6d3',roughness:.6,side:THREE.DoubleSide})));
    const tail = box(.35, 6.5, 5, mat('#345b70'), 0, .5, 13, group); tail.rotation.x = -.3;
    box(12, .3, 3, white, 0, .5, 11, group);
    for (const ex of [-5, 5]) { const engine = new THREE.Mesh(new THREE.CylinderGeometry(.95, .85, 3.4, 12), darkRoof); engine.rotation.x = Math.PI / 2; engine.position.set(ex,-1.1,1); group.add(engine); }
    for (const gx of [-2,2]) box(.55, 2.8, 1.3, mat('#202427'), gx, -4.6, 5, group);
  }
  parkedAircraft(444,-1270); parkedAircraft(579,-1270); parkedAircraft(647,-1270);

  const random = rand(27);
  // Trees and distant houses are instanced to keep the scene light enough for
  // laptop browsers. The near runway corridor is deliberately unobstructed.
  const treeTexture=texture('/assets/tree.png');
  const trees = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 19), new THREE.MeshStandardMaterial({map:treeTexture,alphaTest:.5,side:THREE.DoubleSide,roughness:1}), 600);
  const matrix = new THREE.Matrix4();
  for (let i=0; i<600; i++) {
    let x = 950 + random()*2400, z=-3600+random()*7200;
    if (i<200) { x=-300-random()*180; z=-3500+random()*7000; }
    const size=.7+random()*1.1;
    matrix.compose(new THREE.Vector3(x,9.1*size,z),new THREE.Quaternion(),new THREE.Vector3(size,size,size)); trees.setMatrixAt(i,matrix);
  }
  scene.add(trees);
  const homes = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat('#d5cdbb'),160);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,4),mat('#a78065'),160);
  for (let i=0;i<160;i++) {
    const x=1200+random()*1600,z=-3000+random()*6000,w=10+random()*10,h=5+random()*8,d=10+random()*9;
    matrix.compose(new THREE.Vector3(x,h/2,z),new THREE.Quaternion(),new THREE.Vector3(w,h,d));homes.setMatrixAt(i,matrix);
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);
    matrix.compose(new THREE.Vector3(x,h+2.5,z),q,new THREE.Vector3(w*.8,5,d*.8));roofs.setMatrixAt(i,matrix);
  }
  scene.add(homes,roofs);
  ground(9,7000,mat('#99978d'),880,-800,.01);
  for (let i=0;i<22;i++) {
    const z=-3500+i*240; box(.25,12,.25,darkRoof,820,0,z);
  }

  // Batch static surfaces that share a material. Hundreds of runway stripes,
  // lights and terminal pieces become a handful of GPU submissions.
  scene.updateMatrixWorld(true);
  const batches=new Map();
  scene.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||papi.includes(o))return;
    if(!batches.has(o.material))batches.set(o.material,[]);
    batches.get(o.material).push(o);
  });
  for(const [material,meshes] of batches){
    if(meshes.length<2)continue;
    const parts=meshes.map(m=>m.geometry.clone().applyMatrix4(m.matrixWorld));
    const merged=mergeGeometries(parts,false);
    if(merged){meshes.forEach(m=>m.removeFromParent());scene.add(new THREE.Mesh(merged,material));}
    parts.forEach(g=>g.dispose());
  }

  let width = 0, height = 0, disposed = false;
  function resize() {
    const rect = host.getBoundingClientRect();
    if (rect.width !== width || rect.height !== height) {
      width=rect.width; height=rect.height;
      dirty=true;
      renderer.setSize(width,height,false);
      camera.aspect=width/height; camera.updateProjectionMatrix();
    }
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
  const shake = new THREE.Vector3(),rainData=new Float32Array(220*6),rainSeeds=rand(81),drops=Array.from({length:220},()=>({x:(rainSeeds()-.5)*18,y:rainSeeds()*12,z:-2-rainSeeds()*16}));
  const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainData,3));
  const rainMaterial=new THREE.LineBasicMaterial({color:'#c1d4df',transparent:true,opacity:0,depthWrite:false});
  const rain=new THREE.LineSegments(rainGeometry,rainMaterial);camera.add(rain);scene.add(camera);
  const cloudSky=new THREE.Color('#82919c');
  return {
    update(s,motion=sampleCabinMotion(s)) {
      if(disposed)return;
      const key=[s.time,s.x,s.y,s.z,s.pitch,s.yaw,s.roll,s.weather.visibility,s.weather.rain,s.weather.overcast,motion.x,motion.y,motion.roll,motion.cameraY].join(',');
      if(!dirty&&key===lastView)return;
      dirty=false;lastView=key;
      const overcast=s.weather.overcast||0;
      scene.background=overcast>.2?cloudSky:skyTexture||new THREE.Color('#a4c6e0');
      scene.fog.color.set(overcast>.2?'#a4afb6':'#bccfda');cloudSky.copy(scene.fog.color);scene.fog.density=1.978/Math.max(150,s.weather.visibility||42000);
      sun.intensity=2.9*(1-.78*overcast);ambient.intensity=2.1*(1-.35*overcast);scene.environmentIntensity=.35*(1-.7*overcast);
      runwayMat.roughness=.94-(s.weather.rain||0)*.45;runwayMat.color.setScalar(1-(s.weather.rain||0)*.25);
      rain.visible=(s.weather.rain||0)>0;rainMaterial.opacity=(s.weather.rain||0)*.45;
      if(rain.visible){drops.forEach((drop,i)=>{const y=((drop.y-s.time*9)%12+12)%12-6;rainData.set([drop.x,y,drop.z,drop.x+.07,y-.7,drop.z],i*6);});rainGeometry.attributes.position.needsUpdate=true;}
      shake.set(motion.x*4,motion.cameraY,motion.y*2);
      camera.position.set(s.x,s.y,s.z).add(shake);
      camera.rotation.set(s.pitch-.021+motion.cameraPitch,-s.yaw,-s.roll+motion.roll,'YXZ');
      const pathAngle=Math.atan2(s.y,Math.max(s.z+180,1))*180/Math.PI;
      const reds=pathAngle>3.4?0:pathAngle>3.1?1:pathAngle>2.7?2:pathAngle>2.3?3:4;
      papi.forEach((p,i)=>p.material.color.set(i<reds?'#ff5544':'#fff5ce'));
      renderer.render(scene,camera);
    },
    stats() { return { calls:renderer.info.render.calls,triangles:renderer.info.render.triangles }; },
    dispose() {
      stopLanguage();disposed=true;resizeObserver.disconnect();
      const geometries=new Set(), materials=new Set(), textures=new Set();
      scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
      materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();});
      geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
      if(skyTexture)skyTexture.dispose();
      renderer.dispose();renderer.domElement.remove();
    },
  };
}
