import test from 'node:test';
import assert from 'node:assert/strict';
import {castDrawingVote, voteResult, type VoteDay} from './drawingVotes.ts';
const make = (): VoteDay => ({date:'2026-11-11',revision:0,votes:[],closed:false,rewardsCompleted:false});
const add = (day: VoteDay, voter: string, target: string) => castDrawingVote(day,voter,target,day.date,'2026-11-11T00:00:00Z');
test('one daily vote can change, self and closed-date votes are rejected',()=>{
 let day=add(make(),'a','b');day=add(day,'a','c');
 assert.equal(day.votes.length,1);assert.equal(day.votes[0].targetId,'c');
 assert.throws(()=>add(day,'a','a'));assert.throws(()=>add({...day,closed:true},'b','c'));
 assert.throws(()=>castDrawingVote(day,'b','c','2026-11-12','2026-11-12T00:00:00Z'));
});
test('zero through two votes earn no reward; at least three required',()=>{
 let day=make();assert.deepEqual(voteResult(day).winners,[]);
 day=add(day,'a','winner');day=add(day,'b','winner');assert.deepEqual(voteResult(day).winners,[]);
 day=add(day,'c','winner');assert.deepEqual(voteResult(day).winners,['winner']);assert.equal(voteResult(day).reward,30);
});
test('only joint highest winners with at least three votes receive rewards',()=>{
 let day=make();for(let i=0;i<3;i++){day=add(day,'a'+i,'one');day=add(day,'b'+i,'two');}
 assert.deepEqual(voteResult(day).winners,['one','two']);
 day=add(day,'extra','one');assert.deepEqual(voteResult(day).winners,['one']);
});

test('older vote POST or poll replies and previous-day replies cannot overwrite latest selection',async()=>{
 const {newestVoteSummary}=await import('./drawingVotes.ts');
 const latest={date:'2026-11-11',revision:4,selected:'new'};
 assert.deepEqual(newestVoteSummary(latest,{...latest,revision:3,selected:'old'},latest.date),latest);
 assert.deepEqual(newestVoteSummary(latest,{...latest,date:'2026-11-10',revision:9},latest.date),latest);
 assert.equal(newestVoteSummary(latest,{...latest,revision:5,selected:'newer'},latest.date)?.selected,'newer');
});

test('live highlights require positive votes, include ties, and ignore non-visible entries',async()=>{
 const {drawingVoteLeaders}=await import('./drawingVotes.ts');
 assert.deepEqual(Array.from(drawingVoteLeaders({},['a','b'])),[]);
 assert.deepEqual(Array.from(drawingVoteLeaders({a:0,b:0},['a','b'])),[]);
 assert.deepEqual(Array.from(drawingVoteLeaders({a:1,b:3,removed:20},['a','b'])),['b']);
 assert.deepEqual(Array.from(drawingVoteLeaders({a:3,b:3},['a','b'])),['a','b']);
 assert.deepEqual(Array.from(drawingVoteLeaders({a:4,b:3},['a','b'])),['a']);
});
