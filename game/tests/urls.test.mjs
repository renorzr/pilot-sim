import test from 'node:test';import assert from 'node:assert/strict';
import {siteUrl} from '../src/urls.js';
test('runtime images, textures, radio and gallery resolve under a project-site prefix',()=>{
 for(const path of ['assets/cockpit-frame.png','assets/asphalt.jpg','assets/radio/dual-0.mp3?v=123','assets/radio/en/dual-0.mp3?v=456','designs/']){
  assert.equal(siteUrl(path,'/pilot-sim/'),'/pilot-sim/'+path);
  assert.equal(siteUrl('/'+path,'/pilot-sim'),'/pilot-sim/'+path);
 }
});
test('root-hosted development keeps the existing asset locations',()=>{
 assert.equal(siteUrl('assets/sky.jpg'),'/assets/sky.jpg');
 assert.equal(siteUrl('/designs/','/'),'/designs/');
});
