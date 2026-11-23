import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat} from 'node:fs/promises';import {join} from 'node:path';
import {t,localizeProps,setLanguage,getLanguage} from '../src/i18n/index.js';
import {createRadio,queueRadio,updateRadio,setRadioLanguage,clipUrl} from '../src/comms/radio.js';
import script from '../src/comms/script.json' with {type:'json'};import english from '../src/comms/script.en.json' with {type:'json'};import durations from '../src/comms/durations.en.json' with {type:'json'};
test('all existing interface and model messages have English catalog coverage',async()=>{
 const inventory=JSON.parse(await readFile(new URL('./fixtures/i18n-inventory.json',import.meta.url),'utf8'));
 for(const text of [...inventory.strings,...inventory.templates]){assert(!/\p{Script=Han}/u.test(t(text,'en')),text);assert.equal(t(text,'zh'),text);}
 assert.equal(t('THR LK · W / S 将推力杆匹配至约 24%','en'),'THR LK · W / S match levers to about 24%');
 assert.equal(t('进入三边 · 下风边 · 按航线指引飞行','en'),'Entering Downwind · Follow route guidance');
 assert.equal(t('02 · 大兴 · 17L 进近着陆','en'),'02 · Daxing · Runway 17L Approach');
 assert.equal(t('01 · 大兴 · 17L 起飞','en'),'01 · Daxing · Runway 17L Takeoff');
});
test('JSX boundary localizes text and accessible names without changing handlers or control data',()=>{
 setLanguage('en');const click=()=>{},props={children:['起落架',12],title:'操作说明',onClick:click,'data-level-id':'起飞',style:{color:'red'}};const out=localizeProps(props);
 assert.deepEqual(out.children,['Gear',12]);assert.equal(out.title,'Help');assert.equal(out.onClick,click);assert.equal(out['data-level-id'],'起飞');assert.equal(props.title,'操作说明');setLanguage('zh');assert.equal(getLanguage(),'zh');
});
test('English dialogue covers every event and keeps role/count and initial signal groups',async()=>{
 assert.deepEqual(Object.keys(english),Object.keys(script));const root=process.env.PILOT_SIM_RADIO_ASSETS||new URL('../../public/assets/radio/',import.meta.url).pathname;
 for(const [key,lines]of Object.entries(script))for(let i=0;i<lines.length;i++){
  assert.equal(english[key][i][0],lines[i][0]);assert(!/\p{Script=Han}/u.test(english[key][i][1]));assert.equal(t(lines[i][1],'en'),english[key][i][1]);assert(durations[`${key}-${i}`]>0);assert((await stat(join(root,'en',`${key}-${i}.mp3`))).size>1000);
  if(lines[i][1].startsWith('MAYDAY'))assert(english[key][i][1].startsWith('MAYDAY, MAYDAY, MAYDAY.'));if(lines[i][1].startsWith('PAN PAN'))assert(english[key][i][1].startsWith('PAN PAN, PAN PAN, PAN PAN.'));
 }
});
test('switching an active line preserves flight and emergency state and allows the full localized clip',()=>{
 const s={time:0,x:123,y:500,velocity:{x:1,y:2,z:3},radio:createRadio()};queueRadio(s,'dual',true);s.time=3;updateRadio(s);const active=s.radio.active,pending=structuredClone(s.radio.pending),emergency=structuredClone(s.radio.emergency);s.time=4;setRadioLanguage(s,'en');
 assert.equal(s.radio.active.id,active.id);assert.equal(s.radio.active.until,4+durations[active.clip]+.2);assert.equal(s.x,123);assert.deepEqual(s.velocity,{x:1,y:2,z:3});assert.deepEqual(s.radio.pending,pending);assert.deepEqual(s.radio.emergency,emergency);assert(s.radio.fired.dual);assert.equal(s.radio.language,'en');
 assert(clipUrl('dual-0','en').startsWith('/assets/radio/en/dual-0.mp3'));assert.equal(clipUrl('call-h50','en'),clipUrl('call-h50','zh'));
});
