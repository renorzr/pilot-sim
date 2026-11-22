import test from 'node:test';import assert from 'node:assert/strict';
import {siteUrl} from '../src/urls.js';
test('runtime images, textures, radio resolve under a project-site prefix',()=>{
 for(const path of ['assets/cockpit-frame.png','assets/aircraft/skyline-320.glb','assets/cities/lax/overview.webp','assets/cities/lax/imagery.json','assets/maps/lax-city-source.json','assets/asphalt.jpg','assets/radio/dual-0.mp3?v=123','assets/radio/en/dual-0.mp3?v=456','assets/cockpit-frame-fcu.svg?v=inset-fit-4']){
  assert.equal(siteUrl(path,'/pilot-sim/'),'/pilot-sim/'+path);
  assert.equal(siteUrl('/'+path,'/pilot-sim'),'/pilot-sim/'+path);
 }
});
test('root-hosted development keeps the existing asset locations',()=>{
 assert.equal(siteUrl('assets/sky.jpg'),'/assets/sky.jpg');
 assert.equal(siteUrl('/assets/cockpit-frame-fcu.svg','/'),'/assets/cockpit-frame-fcu.svg');
});
