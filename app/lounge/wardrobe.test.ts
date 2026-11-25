import test from 'node:test';
import assert from 'node:assert/strict';
import {syncWardrobe,availableChoices,chooseWardrobeItem,validateEquipment} from './wardrobe.ts';
import {grantExp} from './utils/exp.ts';
test('5-level rewards migrate retroactively, remain stable and include skipped milestones',()=>{
 const first=syncWardrobe(undefined,12,'rabbit');assert.equal(availableChoices(first),2);
 assert.deepEqual(syncWardrobe(first,12,'rabbit'),first);
 const next=syncWardrobe(first,25,'rabbit');assert.equal(availableChoices(next),5);assert.ok(next.owned.includes('cleanroom'));
 assert.equal(availableChoices(syncWardrobe(next,4,'rabbit')),5);
});
test('choices cannot duplicate, overspend, claim locked or automatic outfits',()=>{
 const first=syncWardrobe(undefined,5,'rabbit');const chosen=chooseWardrobeItem(first,'ribbon',5);
 assert.equal(availableChoices(chosen),0);assert.deepEqual(chooseWardrobeItem(chosen,'ribbon',5),chosen);
 assert.throws(()=>chooseWardrobeItem(chosen,'beret',5));assert.throws(()=>chooseWardrobeItem(first,'glasses',5));assert.throws(()=>chooseWardrobeItem(first,'cleanroom',20));
});
test('equipment requires owned matching slots and enforces costume compatibility',()=>{
 let state=syncWardrobe(undefined,40,'rabbit');state=chooseWardrobeItem(state,'ribbon',40);
 assert.deepEqual(validateEquipment(state,{head:'ribbon'}),{head:'ribbon'});
 assert.throws(()=>validateEquipment(state,{head:'beret'}));assert.throws(()=>validateEquipment(state,{hand:'ribbon'}));assert.throws(()=>validateEquipment(state,{outfit:'wafer',head:'ribbon'}));
 assert.deepEqual(validateEquipment(state,{}),{});
});
test('wardrobe inventory and per-character equipment survive EXP awards and old clients',()=>{
 const state=syncWardrobe(undefined,40,'rabbit');state.equipped.cat_orange={outfit:'cleanroom'};
 const result=grantExp({memberId:'m',characterId:'rabbit',level:40,exp:29,expVersion:3,wardrobe:state},{memberId:'m',date:'2026-11-19',amount:0},8);
 assert.equal(result.profile.level,41);assert.deepEqual(result.profile.wardrobe,state);
});

test('glasses lens centers follow both eyes including the tilted portrait cat',async()=>{
 const {accessoryFit,characterAnatomy,itemById,wardrobeCharacters}=await import('./wardrobe.ts');
 const project=(f:NonNullable<ReturnType<typeof accessoryFit>>,x:number,y:number)=>{const a=f.rotate*Math.PI/180,dx=(x-f.pivotX)*f.w/100,dy=(y-f.pivotY)*f.h/100;return {x:f.x+dx*Math.cos(a)-dy*Math.sin(a),y:f.y+dx*Math.sin(a)+dy*Math.cos(a)};};
 for(const id of wardrobeCharacters) {
  const f=accessoryFit(id,itemById('glasses')!)!;
  for(const index of [0,1]) {
   const x=[29.43,69.91][index];
   const p=project(f,x,50.21),eye=characterAnatomy[id].eyes[index];
   assert.ok(Math.hypot(p.x-eye.x,p.y-eye.y)<.001,`${id}: lens center must coincide with eye`);
  }
 }
 assert.ok(accessoryFit('cat_orange',itemById('glasses')!)!.rotate>3,'Portrait cat glasses must follow the eye tilt');
});
test('flower and wand align their distinct handle pivots to each palm',async()=>{
 const {accessoryFit,characterAnatomy,itemById,wardrobeCharacters}=await import('./wardrobe.ts');
 for(const id of wardrobeCharacters) {
  const flower=accessoryFit(id,itemById('flower')!)!,wand=accessoryFit(id,itemById('wand')!)!;
  assert.deepEqual({x:flower.x,y:flower.y},characterAnatomy[id].grip);
  assert.deepEqual({x:wand.x,y:wand.y},characterAnatomy[id].grip);
  assert.notEqual(flower.pivotY,wand.pivotY);assert.ok(flower.h>0&&wand.h>0);
 }
 assert.equal(characterAnatomy.dog.grip.y,54.5);
});
test('ribbons clear the forehead and hats use their own brim anchor',async()=>{
 const {accessoryFit,itemById}=await import('./wardrobe.ts');
 for(const id of ['cat_russian_blue','bear'] as const) {
  const ribbon=accessoryFit(id,itemById('ribbon')!)!,hat=accessoryFit(id,itemById('beret')!)!;
  assert.ok(ribbon.y<18);assert.ok(hat.y>ribbon.y);assert.notEqual(ribbon.pivotY,hat.pivotY);
 }
});

test('all legal multi-slot combinations remain compatible for every character',async()=>{
 const {wardrobeItems,wardrobeCharacters,accessoryFit}=await import('./wardrobe.ts');
 const state=syncWardrobe(undefined,100,'rabbit');state.owned=wardrobeItems.map(i=>i.id);
 const choices=(slot:string)=>[undefined,...wardrobeItems.filter(i=>i.slot===slot)];
 let count=0;
 for(const character of wardrobeCharacters)for(const background of choices('background')) {
  for(const head of choices('head'))for(const face of choices('face'))for(const neck of choices('neck'))for(const hand of choices('hand')) {
   const items=[background,head,face,neck,hand].filter((i):i is NonNullable<typeof i>=>!!i);
   const equipment=Object.fromEntries(items.map(i=>[i.slot,i.id]));assert.deepEqual(validateEquipment(state,equipment),equipment);
   for(const item of items.filter(i=>i.asset)) {const fit=accessoryFit(character,item)!;assert.ok(Object.values(fit).every(Number.isFinite));assert.ok(fit.w>0&&fit.h>0);}
   count++;
  }
  for(const outfit of wardrobeItems.filter(i=>i.slot==='outfit')) {
   const equipment={...(background?{background:background.id}:{}),outfit:outfit.id};assert.deepEqual(validateEquipment(state,equipment),equipment);count++;
  }
 }
 assert.equal(count,5500);
});
