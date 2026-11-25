import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../data.ts';
import { initialLoungeBundle, updateLoungeBundle } from './atomic-state.ts';
import type { RecordOperation } from '../state-operations.ts';
const profile = {memberId:'m1',characterId:'dog' as const,level:2,exp:6,expVersion:2};
const make = () => initialLoungeBundle({...initialData,characterProfiles:[profile],dailyCharacterExp:[]},'m1',[]);
function award(id:string, action='부재 등록: test 2026-11-09~2026-11-09', amount=2): RecordOperation[] {
 return [
  {collection:'characterProfiles',id:'m1',before:{...profile,exp:0},after:{...profile,exp:amount}},
  {collection:'dailyCharacterExp',id:'m1|2026-11-03',before:null,after:{memberId:'m1',date:'2026-11-03',amount}},
  {collection:'auditLogs',id,before:null,after:{id,at:'2026-11-03T11:28:00Z',actor:'test',action}}
 ];
}
test('already committed stale absence cannot regress progress or duplicate EXP',()=>{
 const b=make(); const r=updateLoungeBundle(b,award('old'),new Set(['old']));
 assert.deepEqual(r.profile,{...profile,expVersion:3});assert.equal(r.daily.length,0);
});
test('new action applies to latest progress, and replay under a different request ID is idempotent',()=>{
 const first=updateLoungeBundle(make(),award('one'),new Set());assert.equal(first.profile.exp,8);
 assert.deepEqual(updateLoungeBundle(first,award('one'),new Set()),first);
 const second=updateLoungeBundle(first,award('two'),new Set());assert.equal(second.profile.exp,10);assert.equal(second.daily[0].amount,4);
});
test('drawing and reward are atomic; a second tab cannot replace the same-day drawing or earn twice',()=>{
 const ops=award('draw','드로잉 제출',7);
 ops.push({collection:'drawingSubmissions',id:'m1',before:null,after:{id:'drawing-m1-2026-11-03',memberId:'m1',date:'2026-11-03',challengeId:'x',imageDataUrl:'image1',score:80,createdAt:'2026-11-03T11:28:00Z'}});
 const first=updateLoungeBundle(make(),ops,new Set());assert.equal(first.profile.exp,13);assert.equal(first.daily[0].amount,7);assert.equal(first.drawing?.score,80);
 const duplicate=structuredClone(ops);duplicate[2].id='draw2';(duplicate[2].after as {id:string}).id='draw2';(duplicate[3].after as {imageDataUrl:string}).imageDataUrl='image2';
 const second=updateLoungeBundle(first,duplicate,new Set());assert.equal(second.profile.exp,13);assert.equal(second.drawing?.imageDataUrl,'image1');
});
test('daily cap and existing character choice survive stale reward requests',()=>{
 const b=make();b.daily=[{memberId:'m1',date:'2026-11-03',amount:14}];b.profile.characterId='fox';
 const r=updateLoungeBundle(b,award('cap'),new Set());assert.equal(r.profile.exp,7);assert.equal(r.daily[0].amount,15);assert.equal(r.profile.characterId,'fox');
});
test('actual conflicting character selections remain explicit conflicts',()=>{
 const b=make();b.profile.characterId='fox';const ops=award('select','캐릭터 변경',0);(ops[0].after as typeof profile).characterId='dog';(ops[0].before as {characterId:string}).characterId='rabbit';
 assert.throws(()=>updateLoungeBundle(b,ops,new Set()),/character_selection_conflict/);
});
