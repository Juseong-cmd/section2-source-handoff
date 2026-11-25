"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingHistoryEntry } from "../lib/drawing-history";
import { getDailyDrawingChallenge } from "./drawingChallenges";
import { DrawingCollectionState } from "./DrawingCollectionState";
import { DrawingResult } from "./DrawingResult";

export function DrawingHistory({ memberId, revision }: { memberId: string; revision: string }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("mine");
  const [entries, setEntries] = useState<DrawingHistoryEntry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  async function load(offset = 0) {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams({ offset: String(offset) });
      if (scope === "mine") params.set("memberId", memberId);
      const response = await fetch(`/api/drawing-history?${params}`, {cache:"no-store",signal:controller.signal});
      if (!response.ok) throw new Error("history");
      const result = await response.json();
      if (!controller.signal.aborted) {
        const incoming: DrawingHistoryEntry[] = result.entries ?? [];
        setEntries(previous => offset === 0 ? incoming : [...previous, ...incoming.filter(entry => !previous.some(old => old.id === entry.id))]);
        setNextOffset(result.nextOffset ?? null);
      }
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    if (!open) return;
    setEntries([]); setSelected(null); setNextOffset(null); void load();
    return () => requestRef.current?.abort();
  }, [open, memberId, scope, revision]);
  return <section className="panel drawing-history" aria-label="그림 보관함">
    <div className="drawing-history-heading"><div><h2>그림 보관함</h2><p>날짜별 그림과 채점 결과를 다시 볼 수 있어요.</p></div>
      <button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "그림 보관함 접기" : "그림 보관함 열기"}
      </button>
    </div>
    {open && <>
    <label>보기 <select value={scope} onChange={event => setScope(event.target.value)}><option value="mine">내 그림</option><option value="all">팀 전체</option></select></label>
    <div className="drawing-history-grid">{entries.map(entry => {
      const challenge = getDailyDrawingChallenge(entry.date);
      const name = challenge.id === entry.challengeId ? challenge.name : "드로잉";
      return <article key={entry.id} className="drawing-history-card">
        <button type="button" aria-expanded={selected === entry.id} onClick={() => setSelected(selected === entry.id ? null : entry.id)} aria-label={`${entry.date} ${entry.memberName} 그림 보기`}>
          {/* Stored images are self-contained snapshots, not external image URLs. */}
          <img src={entry.imageDataUrl} alt={`${entry.memberName}의 ${name} 그림`} loading="lazy" />
          <span><strong>{entry.memberName}</strong><b>{entry.score}점</b></span><small>{entry.date} · {name}</small>
          <small>{entry.grading?.method === "local-ai" ? "상세 채점" : "형태 비교 채점"}</small>
        </button>
        {selected === entry.id && <div className="drawing-history-detail"><DrawingResult score={entry.score} grantedExp={0} grading={entry.grading} /><div className="drawing-history-detail-actions"><button type="button" className="secondary-button small" onClick={() => setSelected(null)}><span aria-hidden="true">⌃</span> 접기</button></div></div>}
      </article>;
    })}</div>
    {loading && <DrawingCollectionState kind="loading" title="그림 이력을 불러오는 중…">보관된 작품과 채점 결과를 확인하고 있어요.</DrawingCollectionState>}
    {error && <DrawingCollectionState kind="error" title="그림 이력을 불러오지 못했어요." action={<button type="button" className="secondary-button small" onClick={() => void load(entries.length ? nextOffset ?? 0 : 0)}>다시 시도</button>}>연결 상태를 확인하고 다시 불러와주세요.</DrawingCollectionState>}
    {!loading && !error && entries.length === 0 && <DrawingCollectionState kind="empty" title="아직 보관된 그림이 없어요.">그림을 제출하면 날짜별로 이곳에 남아요.</DrawingCollectionState>}
    {!loading && !error && nextOffset !== null && <div className="drawing-collection-more"><button type="button" className="secondary-button" onClick={() => void load(nextOffset)}>이전 그림 더 보기</button></div>}

    </>}
  </section>;
}
