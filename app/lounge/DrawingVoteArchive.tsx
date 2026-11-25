"use client";
import {DrawingCollectionState} from "./DrawingCollectionState";
import {useEffect,useRef,useState} from "react";
type Result={date:string;topVotes:number;minimum:number;completed:boolean;winners:{memberId:string;name:string;imageDataUrl:string|null;amount:number|null}[]};
export function DrawingVoteArchive({memberId}:{memberId:string}) {
  const [open,setOpen]=useState(false),[rows,setRows]=useState<Result[]>([]),[next,setNext]=useState<number|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
  const request=useRef<AbortController|null>(null);
  async function load(offset=0) {
    request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);setError(false);
    try {const response=await fetch(`/api/drawing-votes?view=history&offset=${offset}`,{cache:"no-store",signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted){setRows(old=>offset?[...old,...data.entries.filter((r:Result)=>!old.some(e=>e.date===r.date))]:data.entries);setNext(data.nextOffset);}}
    catch{if(!controller.signal.aborted)setError(true);}finally{if(!controller.signal.aborted)setLoading(false);}
  }
  useEffect(()=>{if(open)void load();return()=>request.current?.abort();},[open,memberId]);
  return <section className="panel drawing-vote-archive" aria-label="날짜별 수상작 보관함"><div className="drawing-history-heading"><div><h2>날짜별 수상작</h2><p>동료들의 선택을 받은 작품을 모아봤어요.</p></div><button type="button" className="secondary-button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"수상작 접기":"수상작 보관함 열기"}</button></div>
    {open&&<>{rows.map(day=><article key={day.date}><h3>{day.date} · 최다 {day.topVotes}표</h3>{day.winners.length?<div className="drawing-vote-grid">{day.winners.map(w=><div key={w.memberId} className="drawing-vote-card">{w.imageDataUrl?<img src={w.imageDataUrl} alt={`${day.date} 수상작 ${w.name}`} loading="lazy"/>:<DrawingCollectionState kind="empty" title="보관 이미지 없음">이 날짜의 그림 이미지가 남아 있지 않습니다.</DrawingCollectionState>}<strong>{w.name}</strong><span>{day.completed?(w.amount===null?"보상 반영":w.amount===0?"추가 EXP 없음":`+${w.amount} EXP`):"정산 대기"}</span></div>)}</div>:<DrawingCollectionState kind="empty" title="이날은 수상작이 없어요.">최소 {day.minimum}표 미달로 보상이 지급되지 않았어요.</DrawingCollectionState>}</article>)}
      {loading&&<DrawingCollectionState kind="loading" title="수상작을 불러오는 중…">날짜별 투표 결과와 보관 이미지를 확인하고 있어요.</DrawingCollectionState>}
      {error&&<DrawingCollectionState kind="error" title="수상작을 불러오지 못했습니다." action={<button type="button" className="secondary-button small" onClick={()=>void load(rows.length?next??0:0)}>다시 시도</button>}>잠시 후 다시 확인해주세요.</DrawingCollectionState>}
      {!loading&&!error&&!rows.length&&<DrawingCollectionState kind="empty" title="아직 마감된 투표가 없어요.">투표가 마감되면 수상작과 결과가 이곳에 모여요.</DrawingCollectionState>}
      {!loading&&!error&&next!==null&&<div className="drawing-collection-more"><button type="button" className="secondary-button" onClick={()=>void load(next)}>이전 수상작 더 보기</button></div>}
</>}
  </section>;
}
