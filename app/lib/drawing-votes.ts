import type { AppData } from "../data";
import { getServerSiteConfig } from "../site-config";
import { koreanDateKey } from "../lounge/drawingChallenges";
import { castDrawingVote, voteResult, type VoteDay } from "../lounge/drawingVotes";
import { drawingHistorySnapshot } from "./drawing-history";
import { readDrawingVoteRewards, awardDrawingVoteBonus } from "./lounge-store";

const prefix = `drawing-votes:v1:${getServerSiteConfig().stateKey}:`;
type Row = {key: string; value: VoteDay};
async function db(query: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Vote store unavailable");
  const response = await fetch(`${url}/rest/v1/app_state?${query}`, {...init, cache: "no-store", signal: AbortSignal.timeout(8000), headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers}});
  if (!response.ok && response.status !== 409) throw new Error("Vote store unavailable");
  return response;
}
async function readDay(date: string): Promise<VoteDay | null> {
  const response = await db(new URLSearchParams({key: `eq.${prefix}${date}`, select: "value"}).toString());
  return ((await response.json()) as Row[])[0]?.value ?? null;
}
async function writeDay(before: VoteDay | null, next: VoteDay) {
  const query = before ? new URLSearchParams({key: `eq.${prefix}${next.date}`, "value->>revision": `eq.${before.revision}`}).toString() : "";
  const response = await db(query, {method: before ? "PATCH" : "POST", body: JSON.stringify({key: prefix + next.date, value: next, updated_at: new Date().toISOString()})});
  if (response.status === 409) return false;
  return ((await response.json()) as Row[]).length > 0;
}
export async function saveDrawingVote(data: AppData, voterId: string, targetId: string, date: string) {
  if (!data.members.some(m => m.id === voterId && m.active)) throw new Error("사용자를 다시 선택해주세요.");
  if (!data.members.some(m => m.id === targetId && m.active) || !data.drawingSubmissions.some(d => d.memberId === targetId && d.date === date)) throw new Error("오늘 제출한 그림만 선택할 수 있습니다.");
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await readDay(date);
    const day = before ?? {date, revision: 0, votes: [], closed: false, rewardsCompleted: false};
    const next = castDrawingVote(day, voterId, targetId, koreanDateKey(), new Date().toISOString());
    if (await writeDay(before, next)) return;
  }
  throw new Error("투표 저장이 겹쳤습니다. 다시 시도해주세요.");
}
export async function drawingVoteSummary(date: string, voterId: string) {
  const day = await readDay(date);
  const counts: Record<string, number> = {};
  for (const vote of day?.votes ?? []) if (vote.voterId !== vote.targetId) counts[vote.targetId] = (counts[vote.targetId] ?? 0) + 1;
  const resultResponse = await db(new URLSearchParams({key: `like.${prefix}%`, "value->>closed": "eq.true", select: "value", order: "key.desc", limit: "5"}).toString());
  const closedDays = (await resultResponse.json()) as Row[];
  const latestDay = closedDays[0]?.value;
  const latest = latestDay?.result ? {...latestDay.result, completed: latestDay.rewardsCompleted} : null;
  const [rewards,pendingResponse,statusResponse,scheduledResponse]=await Promise.all([
    readDrawingVoteRewards(voterId),
    db(new URLSearchParams({key:`like.${prefix}%`,"value->>date":`lt.${date}`,"value->>rewardsCompleted":"eq.false",select:"value",order:"key.asc",limit:"31"}).toString()),
    db(new URLSearchParams({key:`eq.${prefix}status`,select:"value"}).toString()),
    db(new URLSearchParams({key:`eq.${prefix}status-scheduled`,select:"value"}).toString())
  ]);
  const pendingDates=((await pendingResponse.json()) as Row[]).map(r=>r.value.date);
  const settlementStatus=((await statusResponse.json()) as {value:{at:string;ok:boolean;source:string}}[])[0]?.value??null;
  const scheduledStatus=((await scheduledResponse.json()) as {value:{at:string;ok:boolean;source:string}}[])[0]?.value??null;
  const recentSettlements=closedDays.map(r=>({date:r.value.date,completed:r.value.rewardsCompleted,settledAt:r.value.settledAt??null,winners:r.value.result?.winners??[],topVotes:r.value.result?.topVotes??0}));
  return {rewards,pendingDates,settlementStatus,scheduledStatus,recentSettlements,date, revision: day?.revision ?? 0, counts, selected: day?.votes.find(v => v.voterId === voterId)?.targetId ?? null, latest};
}
let checkedAt = 0;
export async function settleDrawingVotes(loadData: () => AppData | Promise<AppData>, force = false, source = "manual") {
  try {
  if (!force && Date.now() - checkedAt < 30_000) return false;
  const today = koreanDateKey();
  const query = new URLSearchParams({key: `like.${prefix}%`, "value->>date": `lt.${today}`, "value->>rewardsCompleted": "eq.false", select: "key,value", order: "key.asc", limit: "31"});
  const response = await db(query.toString());
  const rows = await response.json() as Row[];
  if (!rows.length) {
    checkedAt = Date.now();
    if (force) await recordSettlementStatus(true, source);
    return false;
  }
  const data = await loadData();
  let changed = false;
  for (const row of rows) {
    let day = row.value;
    if (!day.closed) {
      const frozen = {...day, revision: day.revision+1, closed: true, winnerNames:Object.fromEntries(data.members.map(m=>[m.id,m.name])), result: voteResult(day)};
      if (!await writeDay(day, frozen)) continue;
      day = frozen;
    }
    if (!day.result) throw new Error("Vote result unavailable");
    const payouts: NonNullable<VoteDay["payouts"]>={};
    for (const memberId of day.result.winners) payouts[memberId]=await awardDrawingVoteBonus(data, memberId, day.date, day.result.reward);
    if(!await writeDay(day, {...day, revision: day.revision+1, rewardsCompleted: true, payouts, settledAt:new Date().toISOString()})) {
      const current=await readDay(day.date);if(!current?.rewardsCompleted)throw new Error("정산 완료 상태를 다시 확인해야 합니다.");
    }
    changed = true;
  }
  checkedAt = Date.now();
  if(force)await recordSettlementStatus(true,source);
  return changed;
  } catch(error) {if(force)await recordSettlementStatus(false,source).catch(()=>{});throw error;}
}
async function recordSettlementStatus(ok:boolean,source:string) {
  const at=new Date().toISOString();
  for(const suffix of ["status",`status-${source}`]) {
    const response=await db("on_conflict=key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({key:prefix+suffix,value:{at,ok,source},updated_at:at})});
    if(!response.ok)throw new Error("정산 점검 기록 저장 실패");
  }
}
export async function listDrawingVoteResults(data:AppData,offset:number) {
  const response=await db(new URLSearchParams({key:`like.${prefix}%`,"value->>closed":"eq.true",select:"value",order:"key.desc",limit:"7",offset:String(offset)}).toString());
  const rows=(await response.json()) as Row[];
  const entries=await Promise.all(rows.slice(0,6).map(async({value:day})=>({date:day.date,topVotes:day.result?.topVotes??0,completed:day.rewardsCompleted,minimum:day.result?.minimum??3,winners:await Promise.all((day.result?.winners??[]).map(async memberId=>{
    const archived=await drawingHistorySnapshot(day.date,memberId);
    const current=data.drawingSubmissions.find(d=>d.date===day.date&&d.memberId===memberId);
    return {memberId,name:day.winnerNames?.[memberId]??archived?.memberName??data.members.find(m=>m.id===memberId)?.name??"이전 사용자",imageDataUrl:archived?.imageDataUrl??current?.imageDataUrl??null,amount:day.payouts?.[memberId]?.amount??null};
  }))})));
  return {entries,nextOffset:rows.length>6?offset+6:null};
}
