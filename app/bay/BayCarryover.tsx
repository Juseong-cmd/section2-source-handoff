"use client";
import { useRef, useState } from "react";
import type { Member } from "../data";
import { canCarry, previousMonth, type Bay } from "./model";
import type { useBay } from "./useBay";

type Row = { id: string; name: string; bay: Bay; revision: number; requestId: string; checked: boolean; result: string; done: boolean };
export function BayCarryover({ store, members, actorId, month }: { store: ReturnType<typeof useBay>; members: Member[]; actorId?: string; month: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [targetMonth, setTargetMonth] = useState(month);
  function open() {
    setTargetMonth(month);
    setRows(members.flatMap(m => {
      const s = store.schedules.find(s => s.id === m.id);
      return s && canCarry(s, month) ? [{ id: m.id, name: m.name, bay: s.months[previousMonth(month)] as Bay, revision: s.revision, requestId: crypto.randomUUID(), checked: true, result: "", done: false }] : [];
    }));
    dialog.current?.showModal();
  }
  async function save() {
    if (!actorId || saving) return;
    setSaving(true);
    try {
      for (const row of rows.filter(r => r.checked && !r.done)) {
        const result = await store.save({ kind: "carry", memberId: row.id, actorId, month: targetMonth, revision: row.revision, requestId: row.requestId, reason: `${previousMonth(targetMonth)} 기본 배정 가져오기` });
        setRows(current => current.map(r => r.id === row.id ? { ...r, done: result.ok, result: result.ok ? "저장 완료" : result.error || "저장 실패" } : r));
      }
    } finally { setSaving(false); }
  }
  return <><button className="secondary-button small" type="button" disabled={!store.loaded || store.busy || !actorId} onClick={open}>지난달 배정 가져오기</button>
    <dialog className="bay-dialog bay-carry" ref={dialog} onCancel={e => { if (saving) e.preventDefault(); }}>
      <div className="bay-dialog-head"><h2>지난달 배정 검토</h2><button aria-label="닫기" disabled={saving} onClick={() => dialog.current?.close()}>×</button></div>
      <div className="bay-dialog-body"><p>{previousMonth(targetMonth)} → {targetMonth}</p><p className="bay-info">기존 월 설정과 기간 백업은 유지됩니다. 아직 설정하지 않은 팀원만 가져옵니다.</p>
        {rows.length ? rows.map(row => <div className="bay-carry-row" key={row.id}><label><input type="checkbox" checked={row.checked} disabled={saving || row.done} onChange={e => setRows(current => current.map(r => r.id === row.id ? { ...r, checked: e.target.checked } : r))} />{row.name}<strong>{row.bay}</strong></label><p role="status">{row.result}</p></div>) : <p>가져올 배정이 없습니다.</p>}
        {rows.some(r => r.result && !r.done) && <p className="bay-info">완료된 항목은 유지됩니다. 충돌 항목은 닫고 최신 배정을 다시 검토해주세요.</p>}
      </div><div className="bay-dialog-footer"><button disabled={saving} onClick={() => dialog.current?.close()}>닫기</button><button className="primary-button" disabled={saving || !actorId || !rows.some(r => r.checked && !r.done)} onClick={() => void save()}>{saving ? "저장 중…" : "선택 배정 저장"}</button></div>
    </dialog></>;
}
