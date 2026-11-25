"use client";
import { startVisiblePolling } from "../visible-polling";
import { useCallback, useEffect, useRef, useState } from "react";
import {DrawingCollectionState} from "./DrawingCollectionState";
import {appStoragePrefix} from "../site-config";
import { DRAWING_VOTE_MINIMUM, DRAWING_VOTE_REWARD, newestVoteSummary, drawingVoteLeaders, type VoteResult } from "./drawingVotes";
import type {DrawingSubmission} from "./types";
type Receipt={date:string;amount:number|null;at:string|null};
type Summary = {date:string;revision:number;counts:Record<string,number>;selected:string|null;latest:(VoteResult&{completed:boolean})|null;rewards?:Receipt[];pendingDates?:string[];settlementStatus?:{at:string;ok:boolean;source:string}|null;scheduledStatus?:{at:string;ok:boolean;source:string}|null;recentSettlements?:{date:string;completed:boolean;settledAt:string|null;winners:string[];topVotes:number}[]};
export function DrawingVotes({memberId,date,members,submissions=[]}: {memberId:string;date:string;members:{id:string;name:string}[];submissions?:DrawingSubmission[]}) {
  const [summary,setSummary]=useState<Summary|null>(null);
  const [saving,setSaving]=useState(false),[checking,setChecking]=useState(false);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState<DrawingSubmission|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(preview)dialog.current?.showModal();else dialog.current?.close();},[preview]);
  const [seen,setSeen]=useState("");
  const seenKey=appStoragePrefix+"-vote-reward-seen-"+memberId;
  useEffect(()=>{try{setSeen(localStorage.getItem(seenKey)??"");}catch{}},[seenKey]);
  const name=(id:string)=>members.find(m=>m.id===id)?.name??"이전 사용자";
  const load=useCallback(async(signal:AbortSignal,force=false)=>{
    try {
      const response=await fetch(`/api/drawing-votes?memberId=${encodeURIComponent(memberId)}${force?"&settle=1":""}`,{cache:"no-store",signal});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(!signal.aborted){setSummary(old=>newestVoteSummary(old,data,date));setError("");}
    }catch{if(!signal.aborted)setError("투표 현황을 불러오지 못했습니다. 잠시 후 다시 확인합니다.");}
  },[memberId,date]);
  useEffect(() => {
    const controller = new AbortController();
    const stop = startVisiblePolling(() => void load(controller.signal), 60_000);
    return () => { controller.abort(); stop(); };
  }, [load]);
  async function vote(candidate:string) {
    if(candidate===memberId||saving)return;
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/drawing-votes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voterId:memberId,targetId:candidate,date})});
      const data=await response.json();if(!response.ok)throw new Error(data.error??"투표를 저장하지 못했습니다.");
      setSummary(old=>newestVoteSummary(old,data,date));
    }catch(e){setError(e instanceof Error?e.message:"투표를 저장하지 못했습니다.");}finally{setSaving(false);}
  }
  async function recheck(force=true){setChecking(true);await load(new AbortController().signal,force);setChecking(false);}
  const latestReward=summary?.rewards?.find(r=>r.amount!==null&&r.amount>0);
  const rewardKey=latestReward?latestReward.date+":"+latestReward.at:"";
  function acknowledge(){setSeen(rewardKey);try{localStorage.setItem(seenKey,rewardKey);}catch{}}
  const leaders=drawingVoteLeaders(summary?.counts??{},submissions.map(d=>d.memberId));
  return <section className="panel drawing-team-voting" aria-label="오늘의 그림 투표">
    <div className="drawing-history-heading"><div><h2>오늘의 작품에 투표하기</h2><p>하루 1표 · 본인 제외 · 자정 전 변경 가능</p></div><span>{submissions.length}명 참여</span></div>
    <p>최소 {DRAWING_VOTE_MINIMUM}표 이상 받은 최다 득표자에게 다음 날 +{DRAWING_VOTE_REWARD} EXP · 공동 1위 모두 지급</p>
    {latestReward&&seen!==rewardKey&&<div className="drawing-reward-notice" role="status"><strong>그림 투표 보너스 +{latestReward.amount} EXP</strong><p>{latestReward.date} 작품으로 최소 3표 이상을 받아 최다 득표했습니다. 경험치에 반영됐어요.</p><button type="button" className="secondary-button small" onClick={acknowledge}>보상 확인</button></div>}
    {summary?.selected&&<p aria-live="polite">내 투표: {name(summary.selected)}</p>}
    <div className="drawing-vote-grid">{submissions.map(drawing=>{
      const own=drawing.memberId===memberId, selected=summary?.selected===drawing.memberId,leading=leaders.has(drawing.memberId);
      return <article className={`drawing-vote-card${selected?" active":""}${leading?" is-leading":""}`} key={drawing.id} aria-label={`${name(drawing.memberId)} 투표 카드`}>
        <div className="drawing-vote-card-status">{leading?<span className="drawing-leader-badge"><span aria-hidden="true">✦</span><span>현재 최다 득표</span></span>:<span className="drawing-vote-card-label">{own?"내 작품":"오늘의 작품"}</span>}</div>
        <button type="button" className="drawing-vote-preview" onClick={()=>setPreview(drawing)} aria-label={`${name(drawing.memberId)} 작품 크게 보기`}><img src={drawing.imageDataUrl} alt={`${name(drawing.memberId)}의 오늘 그림`} loading="lazy"/></button>
        <strong>{name(drawing.memberId)}{own?" · 나":""}</strong><div className="drawing-vote-card-stats" aria-live="polite"><span className="drawing-vote-count">{summary?summary.counts[drawing.memberId]??0:"…"}표</span><span>형태 {drawing.score}점</span></div>
        <button type="button" className="secondary-button" disabled={!summary||saving||own||selected} onClick={()=>void vote(drawing.memberId)} aria-label={own?"내 작품에는 투표할 수 없어요":selected?`${name(drawing.memberId)} 투표한 작품`:`${name(drawing.memberId)} 작품에 투표`}>{saving?"저장 중…":own?"내 작품":selected?"투표한 작품 ✓":summary?.selected?"이 작품으로 변경":"이 작품에 투표"}</button>
      </article>;
    })}</div>
    {!submissions.length&&<DrawingCollectionState kind="empty" title="첫 작품을 기다리고 있어요.">오늘의 그림이 올라오면 이곳에서 비교하고 투표할 수 있어요.</DrawingCollectionState>}
    {summary?.latest&&<div className="drawing-vote-result"><strong>{summary.latest.date} 투표 결과</strong><span>{summary.latest.winners.length?`${summary.latest.winners.map(name).join(", ")} · ${summary.latest.topVotes}표 · ${summary.latest.completed?"보상 정산 완료":"보상 정산 중"}`:`최다 ${summary.latest.topVotes}표 · 최소 ${summary.latest.minimum}표 미달로 보상 없음`}</span></div>}
    <details className="drawing-reward-ledger"><summary>내 투표 보상 내역</summary>{summary?.rewards?.length?<ul>{summary.rewards.map(r=><li key={r.date}>{r.date} 최다 득표 · {r.amount===null?"보상 반영 (이전 기록)":r.amount===0?"추가 EXP 없음 (이전 지급 기록)":`+${r.amount} EXP`}{r.at?` · ${new Date(r.at).toLocaleString("ko-KR")}`:""}</li>)}</ul>:<p>아직 지급된 투표 보너스가 없어요.</p>}</details>
    <details className="drawing-settlement"><summary>투표 정산 현황</summary><p>예약 정산: 한국 시간 매일 00:05 · 실행 시각이 지연될 수 있으며, 자정 이후 접속 시에도 확인합니다.</p><p>정산 대기: {summary?.pendingDates?.length??0}일{(summary?.pendingDates?.length??0)>=31?" 이상":""}{summary?.pendingDates?.length?` (${summary.pendingDates.join(", ")})`:""}</p>
      {summary?.scheduledStatus?<p>최근 예약 실행: {new Date(summary.scheduledStatus.at).toLocaleString("ko-KR")} · {summary.scheduledStatus.ok?"정상":"재확인 필요"}</p>:<p>아직 예약 정산 실행 기록이 없습니다.</p>}
      {summary?.settlementStatus&&<p>최근 {summary.settlementStatus.source==="scheduled"?"예약":"수동"} 점검: {new Date(summary.settlementStatus.at).toLocaleString("ko-KR")} · {summary.settlementStatus.ok?"정상":"재확인 필요"}</p>}
      <ul>{summary?.recentSettlements?.map(r=><li key={r.date}>{r.date} · {r.completed?"완료":"지급 대기"} · {r.winners.length?`${r.winners.map(name).join(", ")} / ${r.topVotes}표`:"최소 득표 미달, 보상 없음"}{r.settledAt?` · ${new Date(r.settledAt).toLocaleString("ko-KR")}`:""}</li>)}</ul>
      <button type="button" className="secondary-button" onClick={()=>void recheck()} disabled={checking}>{checking?"확인 중…":"정산 다시 확인"}</button>
    </details>
    <dialog ref={dialog} className="modal-card drawing-preview-dialog" aria-label="작품 크게 보기" onClose={()=>setPreview(null)} onClick={e=>{if(e.target===e.currentTarget)setPreview(null);}}>
      {preview&&<div><h3>{name(preview.memberId)}의 작품</h3><img src={preview.imageDataUrl} alt={`${name(preview.memberId)}의 확대 그림`}/><button type="button" className="secondary-button" onClick={()=>setPreview(null)}>확대 보기 닫기</button></div>}
    </dialog>
    {error&&<DrawingCollectionState kind="error" title="투표를 확인해주세요." action={<button type="button" className="secondary-button small" disabled={checking} onClick={()=>void recheck(false)}>{checking?"확인 중…":"다시 확인"}</button>}>{error}</DrawingCollectionState>}
  </section>;
}
