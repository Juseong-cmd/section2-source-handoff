import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceLanes, mergedAttendance } from "./attendance-lanes.ts";
import { attendanceLabel, memberDayStatus } from "./attendance-display.ts";
import type { Absence } from "./data";
const days = Array.from({length:7},(_,i)=>`2026-10-${11+i}`);
const item = (id:string, startDate:string, endDate:string, type = "annual"): Absence => ({id,memberId:id,startDate,endDate,type,label:"",memo:""} as Absence);
test("memo differences stay separate and merged bars retain editable source IDs", () => {
 const a=item("a","2026-10-12","2026-10-13");
 const b={...a,id:"b",startDate:"2026-10-14",endDate:"2026-10-15"};
 assert.deepEqual(mergedAttendance([a,b])[0].sourceIds,["a","b"]);
 assert.equal(mergedAttendance([a,{...b,memo:"다른 사유"}]).length,2);
});
test("standard type and custom text remain distinct without changing stored data", () => {
 const a={...item("a","2026-10-12","2026-10-13"),label:"휴가"};
 assert.equal(attendanceLabel(a),"연차 · 휴가");assert.equal(a.label,"휴가");
 assert.equal(memberDayStatus([a],"a","2026-10-12"),"away");
 assert.equal(memberDayStatus([{...a,label:"오전반차"}],"a","2026-10-12"),"check");
 assert.equal(memberDayStatus([{...a,type:"flex",label:"",flexTime:"15:30"}],"a","2026-10-12"),"check");
 assert.equal(memberDayStatus([{...a,type:"etc",label:"최종검수"}],"a","2026-10-12"),"check");
});
test("continuous intervals merge without modifying source; types stay separate",()=>{
 const a=item("a","2026-10-12","2026-10-13");
 const result=attendanceLanes([a,{...a,id:"a2",startDate:"2026-10-14",endDate:"2026-10-16"},{...a,id:"a3",type:"training",startDate:"2026-10-17",endDate:"2026-10-17"}],days);
 assert.equal(result.segments.length,2);assert.equal(result.segments[0].end,5);assert.equal(a.endDate,"2026-10-13");
});
test("all ten overlapping people get lanes, clipped only to week boundary",()=>{
 const result=attendanceLanes(Array.from({length:10},(_,i)=>item(String(i),"2026-10-01","2026-10-30")),days);
 assert.equal(result.count,10);assert.equal(new Set(result.segments.map(s=>s.lane)).size,10);assert.ok(result.segments.every(s=>s.start===0&&s.end===6));
});
test("nonoverlapping intervals reuse lanes; time changes and gaps stay separate",()=>{
 const a=item("a","2026-10-11","2026-10-12","flex");
 const result=attendanceLanes([{...a,flexTime:"09:30"},{...a,id:"b",startDate:"2026-10-13",endDate:"2026-10-13",flexTime:"10:30"},{...a,id:"c",startDate:"2026-10-15",endDate:"2026-10-16",flexTime:"10:30"}],days);
 assert.equal(result.segments.length,3);assert.equal(result.count,1);
});
