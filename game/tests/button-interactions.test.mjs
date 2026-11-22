import test from 'node:test';
import assert from 'node:assert/strict';
import {buttonInteractionProps} from '../src/button-interactions.js';
import {jsx} from '../src/i18n/jsx-runtime.js';
import {jsxDEV} from '../src/i18n/jsx-dev-runtime.js';
test('button policy prevents pointer focus while retaining click and held-input handlers',()=>{
 const calls=[],click=()=>{},pointer=()=>{},props={tabIndex:0,onClick:click,onPointerDown:pointer,onMouseDown:()=>calls.push('mouse')};
 const out=buttonInteractionProps('button',props);assert.equal(out.tabIndex,-1);assert.equal(out.onClick,click);assert.equal(out.onPointerDown,pointer);assert.equal(props.tabIndex,0);
 out.onMouseDown({preventDefault:()=>calls.push('prevent')});assert.deepEqual(calls,['prevent','mouse']);
});
test('programmatic button focus clears immediately, including SVG buttons, while inputs retain their focus behaviour',()=>{
 const calls=[],out=buttonInteractionProps('g',{role:'button',onFocus:()=>calls.push('original')});assert.equal(out.tabIndex,-1);
 out.onFocus({currentTarget:{blur:()=>calls.push('blur')}});assert.deepEqual(calls,['blur','original']);const input={type:'range',tabIndex:0};assert.equal(buttonInteractionProps('input',input),input);
});
test('development and production JSX runtimes both enforce the button policy',()=>{
 for(const element of[jsx('button',{children:'+'}),jsxDEV('button',{children:'−'},undefined,false,undefined,undefined)]){assert.equal(element.props.tabIndex,-1);assert.equal(typeof element.props.onMouseDown,'function');assert.equal(typeof element.props.onFocus,'function');}
});
