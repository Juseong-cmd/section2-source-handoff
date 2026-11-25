"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Absence, type Member } from "../data";
import { BAY_NAMES, activeBackup, baseBay, effectiveBay, emptySchedule, overlaps, type Bay, type BayCommand, type BaySchedule } from "./model";
import type { useBay } from "./useBay";

import { BayCarryover } from "./BayCarryover";
import { attendanceLabel, attendanceImpact, memberDayStatus } from "../attendance-display";

type BayStore = ReturnType<typeof useBay>;
type Draft = {
  kind: "base" | "backup" | "cancel"; memberId: string; bay: Bay | ""; month: string;
  start: string; end: string; reason: string; backupId: string; revision: number; requestId: string; acknowledgePartial?: boolean;
};
const onDate = (absences: Absence[], memberId: string, date: string) => absences.filter(a => a.memberId === memberId && a.startDate <= date && a.endDate >= date);
const absenceText = attendanceLabel;

export function BayDaySummary({ schedules, members, absences, date, onOpen }: { schedules: BaySchedule[]; members: Member[]; absences: Absence[]; date: string; onOpen: () => void }) {
  return <div className="bay-day-summary"><div className="bay-section-head"><h3>Bay 현황</h3><button type="button" onClick={onOpen}>배정 보기</button></div><div>{BAY_NAMES.map(bay => {
    const group = members.filter(m => effectiveBay(schedules.find(s => s.id === m.id), date) === bay);
    const available = group.filter(m => memberDayStatus(absences, m.id, date) === "available");
    const check = group.filter(m => memberDayStatus(absences, m.id, date) === "check");
    return <span key={bay}><strong>{bay}</strong> {available.length}<small> / 배정 {group.length}명{check.length ? ` · 시간 확인 ${check.length}명` : ""}</small></span>;
  })}</div></div>;
}

export function BayWorkspace({ store, members, absences, actorId, date, onDateChange }: { store: BayStore; members: Member[]; absences: Absence[]; actorId?: string; date: string; onDateChange: (value: string) => void }) {
  const [tab, setTab] = useState<"daily" | "monthly" | "history">("daily");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState<BaySchedule | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const month = date.slice(0, 7);
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const schedule = (id: string) => store.schedules.find(s => s.id === id);
  const name = (id: string) => members.find(m => m.id === id)?.name || store.schedules.find(s => s.id === id)?.history.at(-1)?.memberName || "삭제된 사용자";
  const allBackups = store.schedules.flatMap(s => s.backups.filter(b => !b.cancelled && overlaps(b.start, b.end, month + "-01", monthEnd)).map(b => ({ ...b, memberId: s.id })));
  const logs = store.schedules.flatMap(s => s.history).filter(h => overlaps(h.start, h.end, month + "-01", monthEnd)).sort((a, b) => b.at.localeCompare(a.at));
  const backupChecks = draft?.kind === "backup" ? absences.filter(a => a.memberId === draft.memberId && overlaps(a.startDate, a.endDate, draft.start, draft.end) && attendanceImpact(a) === "check") : [];
  const controlsDisabled = !store.loaded || store.busy || !actorId;

  useEffect(() => { if (draft && !dialog.current?.open) dialog.current?.showModal(); }, [draft]);
  useEffect(() => { if (!actorId) { dialog.current?.close(); setDraft(null); } }, [actorId]);
  function close() { if (store.busy) return; dialog.current?.close(); setDraft(null); setFormError(""); setConflict(null); }
  function open(kind: Draft["kind"], id = actorId || members[0]?.id || "", backupId = "", targetBay?: Bay) {
    const current = schedule(id) ?? emptySchedule(id);
    const item = current.backups.find(b => b.id === backupId);
    setFormError(""); setConflict(null);
    setDraft({ kind, memberId: id, month, bay: targetBay || (kind === "base" ? baseBay(current, date) : BAY_NAMES.find(b => b !== baseBay(current, date)) || "Wet"), start: item?.start || date, end: item?.end || date, reason: "", backupId, revision: current.revision, requestId: crypto.randomUUID() });
  }
  function change(patch: Partial<Draft>) { setDraft(current => current ? { ...current, ...(patch.memberId || patch.start || patch.end ? { acknowledgePartial: false } : {}), ...patch, requestId: crypto.randomUUID() } : current); setFormError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !actorId || conflict) return;
    const common = { memberId: draft.memberId, actorId, revision: draft.revision, reason: draft.reason, requestId: draft.requestId };
    const command: BayCommand = draft.kind === "base" ? { ...common, kind: "base", bay: draft.bay, month: draft.month } : draft.kind === "backup" ? { ...common, kind: "backup", bay: draft.bay as Bay, start: draft.start, end: draft.end, acknowledgePartial: draft.acknowledgePartial } : { ...common, kind: "cancel", backupId: draft.backupId };
    const result = await store.save(command);
    if (result.ok) { dialog.current?.close(); setDraft(null); setFormError(""); }
    else { setFormError(result.error || "저장 실패"); setConflict(result.conflict ?? null); }
  }
  const memberLabel = (m: Member) => <span className="bay-person-name"><i style={{ background: m.color }} />{m.name}</span>;
  return <section className="bay-workspace">
    <div className="bay-tabs" role="tablist" aria-label="Bay 화면">{([['daily','일별 현황'],['monthly','월 기본 배정'],['history','변경 이력']] as const).map(([value,label]) => <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="bay-toolbar"><div><label>{tab === "daily" ? "조회 날짜" : "조회 월"}<input aria-label={tab === "daily" ? "조회 날짜" : "조회 월"} type={tab === "daily" ? "date" : "month"} value={tab === "daily" ? date : month} min={tab === "daily" ? "2000-01-01" : "2000-01"} max={tab === "daily" ? "2099-12-31" : "2099-12"} onChange={e => { if (e.target.value) onDateChange(tab === "daily" ? e.target.value : e.target.value + "-01"); }} /></label><span role="status">{store.busy ? "저장 중" : store.error ? "" : store.savedAt ? `${store.savedAt} 저장됨` : store.loaded ? "" : "불러오는 중"}</span></div>{tab === "monthly" && <BayCarryover store={store} members={members} actorId={actorId} month={month} />}{tab === "daily" && <button className="primary-button" type="button" disabled={controlsDisabled} onClick={() => open("backup")}>백업 배정</button>}</div>
    {store.error && <div className="bay-error" role="alert">{store.error} <button type="button" onClick={() => void store.refresh()}>다시 불러오기</button></div>}
    {!store.loaded ? <p className="bay-empty">Bay 배정을 불러오는 중입니다.</p> : <>
    {tab === "daily" && <>
      <div className="bay-overview"><span>팀원 <b>{members.length}명</b></span><span>부재 <b>{members.filter(m => memberDayStatus(absences, m.id, date) === "away").length}명</b></span><span>백업 <b>{members.filter(m => activeBackup(schedule(m.id), date)).length}명</b></span></div>
      <div className="bay-columns">{BAY_NAMES.map(bay => {
        const group = members.filter(m => effectiveBay(schedule(m.id), date) === bay);
        const available = group.filter(m => memberDayStatus(absences, m.id, date) === "available").length;
        const check = group.filter(m => memberDayStatus(absences, m.id, date) === "check").length;
        const warning = !group.length ? "오늘 배정 없음" : !available && !check ? "배정자 전원 종일 부재" : !available ? "근무 시간 확인 필요" : "";
        return <section className="bay-column" key={bay}><div className="bay-section-head"><h2>{bay}</h2><span>일정상 가용 {available} / 배정 {group.length}명</span></div>
        {(warning || check > 0) && <div className="bay-coverage"><strong>{warning || `부분 근무·직접 입력 ${check}명 확인 필요`}</strong>{warning && <button type="button" disabled={controlsDisabled} onClick={() => { const candidate = members.find(m => effectiveBay(schedule(m.id), date) !== bay && memberDayStatus(absences, m.id, date) === "available"); open("backup", candidate?.id, "", bay); }}>지원 배정</button>}</div>}{group.map(m => {
          const backup = activeBackup(schedule(m.id), date), away = onDate(absences, m.id, date);
          return <div className="bay-person" key={m.id}><div>{memberLabel(m)}{backup && <small>{baseBay(schedule(m.id), date) || "미배정"} → {bay} · {backup.end.slice(5).replace("-", ".")}까지</small>}</div><div className="bay-tags">{backup && <span className="bay-tag backup">백업</span>}{away.map(a => <span className="bay-tag absent" key={a.id}>{absenceText(a)}</span>)}{!backup && !away.length && <span className="bay-tag">기본</span>}</div></div>;
        })}{!group.length && <p className="bay-empty">배정된 팀원이 없습니다.</p>}</section>;
      })}</div>
      <div className="bay-unassigned"><h3>미배정</h3><p>{members.filter(m => !effectiveBay(schedule(m.id), date)).map(m => m.name).join(" · ") || "없음"}</p></div>
      <h3 className="bay-list-title">이번 달 백업</h3><div className="bay-table-wrap"><table><thead><tr><th>담당자</th><th>백업 Bay</th><th>기간 · 사유</th><th>관리</th></tr></thead><tbody>{allBackups.map(b => <tr key={b.id}><td>{name(b.memberId)}</td><td>{b.bay}</td><td>{b.start} ~ {b.end}<small>{b.reason}</small></td><td><button type="button" disabled={controlsDisabled || !members.some(m => m.id === b.memberId)} onClick={() => open("cancel", b.memberId, b.id)}>백업 취소</button></td></tr>)}</tbody></table>{!allBackups.length && <p className="bay-empty">등록된 백업이 없습니다.</p>}</div>
    </>}
    {tab === "monthly" && <div className="bay-table-wrap"><table><thead><tr><th>사용자</th><th>기본 Bay</th><th>기간 백업</th><th>관리</th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{memberLabel(m)}</td><td>{baseBay(schedule(m.id), date) || "미배정"}</td><td>{allBackups.filter(b => b.memberId === m.id).map(b => <small key={b.id}>{b.bay} · {b.start.slice(5)} ~ {b.end.slice(5)}</small>)}</td><td><button type="button" disabled={controlsDisabled} onClick={() => open("base", m.id)} aria-label={`${m.name} 기본 Bay 수정`}>수정</button></td></tr>)}</tbody></table></div>}
    {tab === "history" && <div className="bay-table-wrap"><table className="bay-history"><thead><tr><th>변경 시각</th><th>변경자 · 대상자</th><th>변경 내용</th><th>적용 기간</th><th>사유</th></tr></thead><tbody>{logs.map(h => <tr key={h.id}><td>{new Date(h.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</td><td>{h.actorName}<small>대상 {h.memberName}</small></td><td>{h.action === "carry" ? "지난달 배정 가져오기" : h.action === "base" ? "기본 변경" : h.action === "backup" ? "백업 등록" : "백업 취소"}<small>{h.before} → {h.after}</small></td><td>{h.start} ~ {h.end}</td><td>{h.reason}</td></tr>)}</tbody></table>{!logs.length && <p className="bay-empty">이 달의 변경 이력이 없습니다.</p>}</div>}
    </>}
    <dialog ref={dialog} className="bay-dialog" onCancel={e => { e.preventDefault(); close(); }}><form onSubmit={submit}><div className="bay-dialog-head"><h2>{draft?.kind === "base" ? "월 기본 Bay 수정" : draft?.kind === "cancel" ? "백업 취소" : "기간 백업 배정"}</h2><button type="button" aria-label="닫기" onClick={close} disabled={store.busy}>×</button></div>{draft && <><fieldset disabled={store.busy} className="bay-dialog-body">
      <label>담당자<select aria-label="담당자" value={draft.memberId} disabled={draft.kind !== "backup"} onChange={e => { change({ memberId: e.target.value, revision: schedule(e.target.value)?.revision ?? 0 }); setConflict(null); }}>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
      {draft.kind !== "cancel" && <label>{draft.kind === "base" ? "기본 Bay" : "백업 Bay"}<select aria-label={draft.kind === "base" ? "기본 Bay" : "백업 Bay"} value={draft.bay} onChange={e => change({ bay: e.target.value as Bay | "" })}>{draft.kind === "base" && <option value="">미배정</option>}{BAY_NAMES.map(b => <option key={b}>{b}</option>)}</select></label>}
      {draft.kind === "base" ? <p>{draft.month}월 · 현재 {baseBay(schedule(draft.memberId), draft.month + "-01") || "미배정"}</p> : <div className="bay-dates"><label>시작일<input type="date" required value={draft.start} disabled={draft.kind === "cancel"} onChange={e => change({ start: e.target.value })} /></label><label>종료일<input type="date" required min={draft.start} value={draft.end} disabled={draft.kind === "cancel"} onChange={e => change({ end: e.target.value })} /></label></div>}
      {backupChecks.length > 0 && <div className="bay-partial-check"><p>{backupChecks.map(a => `${a.startDate} ~ ${a.endDate} · ${absenceText(a)}`).join(", ")}</p><label><input type="checkbox" required checked={!!draft.acknowledgePartial} onChange={e => change({ acknowledgePartial: e.target.checked })} />해당 기간의 실제 지원 가능 시간을 확인했습니다</label></div>}
      <label>변경 사유<input required maxLength={240} value={draft.reason} onChange={e => change({ reason: e.target.value })} placeholder="예: 연차 인원 지원" /></label>
      <p className="bay-info">{draft.kind === "base" ? "해당 월의 기본 배정이 변경됩니다. 등록된 기간 백업은 유지됩니다." : draft.kind === "cancel" ? "이 백업 기간 전체를 취소하고 해당 월의 기본 Bay를 적용합니다. 취소 이력은 보존됩니다." : `시작일 기본 Bay: ${baseBay(schedule(draft.memberId), draft.start) || "미배정"}. 종료일 다음 날부터 해당 월의 기본 Bay로 복귀합니다.`}</p>
      {formError && <p className="bay-error" role="alert">{formError}</p>}
      {conflict && <div className="bay-error"><p>최신 기본 Bay: {baseBay(conflict, draft.start) || "미배정"} · 등록된 백업 {conflict.backups.filter(b => !b.cancelled).length}건</p><button type="button" onClick={() => { change({ revision: conflict.revision }); setConflict(null); }}>최신 배정 기준으로 다시 검토</button><button type="button" onClick={close}>닫고 현황 보기</button></div>}
    </fieldset><div className="bay-dialog-footer"><button type="button" onClick={close} disabled={store.busy}>닫기</button><button className="primary-button" type="submit" disabled={store.busy || !!conflict || !actorId}>{store.busy ? "저장 중…" : draft.kind === "cancel" ? "백업 취소 저장" : "저장"}</button></div></>}</form></dialog>
  </section>;
}
