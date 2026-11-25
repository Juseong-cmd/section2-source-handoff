"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Absence, type Member, type OvertimeAssignment } from "../data";
import { eventFields, eventLabel, eventOccursOn, eventDateLabel, eventTimeLabel, type CommonEvent, type EventDraft } from "./model";
import type { CommonEventStore } from "./useCommonEvents";
import { attendanceLabel } from "../attendance-display";
import { appHasOvertime } from "../site-config";

export function EventBadges({ events, onOpen, onCancelGesture }: { events: CommonEvent[]; onOpen?: (id: string) => void; onCancelGesture?: () => void }) {
  return <span className="common-cell-events">{events.filter(e => !e.cancelled).sort((a, b) => a.start.localeCompare(b.start)).map(e => {
    return <button type="button" key={e.id} className="common-cell-event" aria-label={`${e.title} 공통 일정 열기`} title={`${e.allDay ? "전일" : e.start} ${e.title} · ${eventLabel(e)}`} onPointerDown={event => { event.stopPropagation(); onCancelGesture?.(); }} onClick={event => { event.stopPropagation(); onOpen?.(e.id); }}><span>{e.allDay ? "전일" : e.start} {e.title}</span></button>;
  })}</span>;
}
const absent = (absences: Absence[], id: string, date: string) => absences.filter(a => a.memberId === id && a.startDate <= date && a.endDate >= date);
const formatAt = (at: string) => new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function WeekContext({ date, endDate = date, members, absences, assignments, onSelect }: { date: string; endDate?: string; members: Member[]; absences: Absence[]; assignments: OvertimeAssignment[]; onSelect?: (start: string, end: string) => void }) {
  const [visibleDate, setVisibleDate] = useState(date);
  const gesture = useRef<{ anchor: string; beforeStart: string; beforeEnd: string } | null>(null);
  const selectionAnchor = useRef(date);
  useEffect(() => { if (!gesture.current && date) setVisibleDate(date); }, [date]);
  const anchor = new Date(`${visibleDate}T00:00:00Z`), weekday = anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  const days = Array.from({ length: 5 }, (_, i) => { const day = new Date(anchor); day.setUTCDate(day.getUTCDate() + i); return day.toISOString().slice(0, 10); });
  const selected = (day: string) => day >= date && day <= endDate;
  function select(from: string, to: string) { onSelect?.(from < to ? from : to, from < to ? to : from); }
  function moveWeek(offset: number) { const day = new Date(anchor); day.setUTCDate(day.getUTCDate() + offset); setVisibleDate(day.toISOString().slice(0, 10)); }
  return <>
    <div className="day-detail-section-head"><h3>주간 {appHasOvertime ? "근태·잔업" : "근태"} 현황</h3><div className="common-week-nav"><button type="button" aria-label="이전 주" onClick={() => moveWeek(-7)}>‹</button><span>{days[0].slice(5)} ~ {days[4].slice(5)}</span><button type="button" aria-label="다음 주" onClick={() => moveWeek(7)}>›</button></div></div>
    {onSelect && <p className="common-note">날짜 헤더를 드래그하거나 시작일 클릭 후 Shift+클릭으로 기간을 선택하세요. 주말·다른 달은 시작일과 종료일에 직접 입력할 수 있습니다.</p>}
    <div className="day-week-scroll"><div className="day-week-matrix">
      <div className="day-week-cell name header">사용자</div>
      {days.map((d, i) => onSelect ? <button type="button" key={d} data-common-date={d} aria-label={`${d} 선택`} aria-pressed={selected(d)} className={`day-week-cell header common-date-select ${selected(d) ? "selected" : ""}`}
        onPointerDown={e => {
          if (e.button !== 0 || !e.isPrimary) return;
          const from = e.shiftKey ? selectionAnchor.current : d;
          selectionAnchor.current = from;
          gesture.current = { anchor: from, beforeStart: date, beforeEnd: endDate };
          e.currentTarget.setPointerCapture(e.pointerId);
          select(from, d);
        }}
        onPointerMove={e => {
          if (!gesture.current) return;
          const header = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-common-date]");
          if (header && e.currentTarget.parentElement?.contains(header)) select(gesture.current.anchor, header.dataset.commonDate!);
        }}
        onPointerUp={e => { gesture.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { const previous = gesture.current; gesture.current = null; if (previous) onSelect(previous.beforeStart, previous.beforeEnd); }}
        onLostPointerCapture={() => { gesture.current = null; }}
        onClick={e => { if (e.detail === 0) { const from = e.shiftKey ? selectionAnchor.current : d; selectionAnchor.current = from; select(from, d); } }}
      >{["월", "화", "수", "목", "금"][i]} {Number(d.slice(8))}</button> : <div key={d} className={`day-week-cell header ${selected(d) ? "selected" : ""}`}>{["월", "화", "수", "목", "금"][i]} {Number(d.slice(8))}</div>)}
      {members.map(m => <div className="day-week-row" key={m.id}><div className="day-week-cell name"><i style={{ background: m.color }} />{m.name}</div>{days.map(d => <div key={d} className={`day-week-cell ${selected(d) ? "selected" : ""}`}>{absent(absences, m.id, d).map(a => <span className="day-week-badge annual" key={a.id}>{attendanceLabel(a)}</span>)}{appHasOvertime && assignments.some(a => a.memberId === m.id && a.date === d) && <span className="day-week-badge overtime">잔업</span>}</div>)}</div>)}
    </div></div>
  </>;
}

type FormState = { id: string; revision: number; requestId: string; fields: EventDraft };
function newForm(date: string, members: Member[], event?: CommonEvent, endDate = date): FormState {
  const fields = event ? eventFields(event) : null;
  return { id: event?.id ?? `event-${crypto.randomUUID()}`, revision: event?.revision ?? 0, requestId: crypto.randomUUID(), fields: fields ? { ...fields, responseMode: "confirm", deadline: "", targetIds: fields.targets.map(t => t.id) } : { title: "", kind: "meeting", meal: "lunch", date, endDate, allDay: false, start: "14:00", end: "15:00", location: "", notes: "", responseMode: "confirm", deadline: "", targetIds: members.map(m => m.id) } };
}

export function CommonEventWorkspace({ date, initialEndDate, store, members, absences, assignments, actorId, intent, onSaved }: { date: string; initialEndDate?: string; store: CommonEventStore; members: Member[]; absences: Absence[]; assignments: OvertimeAssignment[]; actorId?: string; intent: string; onSaved: (date: string, id: string) => void }) {
  const [form, setForm] = useState<FormState | null>(() => intent === "new" ? newForm(date, members, undefined, initialEndDate) : null);
  const [selected, setSelected] = useState(intent === "new" ? "" : intent);
  const [mode, setMode] = useState<"detail" | "history" | "cancel">("detail");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [cancelRevision, setCancelRevision] = useState(0);
  const dayEvents = store.events.filter(e => eventOccursOn(e, date)).sort((a, b) => Number(a.cancelled) - Number(b.cancelled) || a.start.localeCompare(b.start));
  const event = store.events.find(e => e.id === selected) ?? dayEvents[0];
  const owner = event?.creatorId === actorId;
  const busy = store.busy || !actorId;
  function update(fields: Partial<EventDraft>) { setForm(current => current ? { ...current, requestId: crypto.randomUUID(), fields: { ...current.fields, ...fields } } : null); setError(""); }
  function reset() { setError(""); setConflict(false); setMode("detail"); setForm(null); setCancelReason(""); }
  function edit(existing?: CommonEvent) { reset(); setForm(newForm(date, members, existing)); }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!form || !actorId || conflict) return;
    const result = await store.save({ kind: "save", eventId: form.id, actorId, revision: form.revision, requestId: form.requestId, fields: form.fields });
    if (result.ok) { const saved = form; reset(); setSelected(saved.id); onSaved(saved.fields.date, saved.id); }
    else { setError(result.error || "저장 실패"); setConflict(!!result.conflict); }
  }
  async function cancel(e: FormEvent) {
    e.preventDefault(); if (!event || !actorId) return;
    const result = await store.save({ kind: "cancel", eventId: event.id, actorId, revision: cancelRevision, requestId, reason: cancelReason });
    if (result.ok) reset(); else { setError(result.error || "취소 실패"); if (result.conflict) { setMode("detail"); setCancelReason(""); } }
  }
  const allTargets = form ? [...members, ...(store.events.find(e => e.id === form.id)?.targets ?? []).filter(t => !members.some(m => m.id === t.id)).map(t => ({ ...t, active: false, color: "#717171" }))] : [];
  const history = event ? [...event.history.map(h => ({ at: h.at, id: h.id, text: `${h.actorName} · ${h.action === "create" ? "일정 등록" : h.action === "cancel" ? "일정 취소" : "일정 수정"}`, detail: h.reason || `${eventDateLabel(h.after)} ${eventTimeLabel(h.after)} · ${h.after.location || "장소 미정"}`, before: h.action === "edit" && h.before ? `${eventDateLabel(h.before)} ${eventTimeLabel(h.before)} · ${h.before.title} · ${h.before.location || "장소 미정"} · 대상 ${h.before.targets.length}명` : "" }))].sort((a, b) => b.at.localeCompare(a.at)) : [];

  return <div className="day-detail-body common-workspace"><aside className="day-detail-left">
    <div className="common-section-head"><h3>{form ? form.revision ? "공통 일정 수정" : "공통 일정 등록" : "선택일 공통 일정"}</h3>{!form && <button type="button" className="secondary-button small" disabled={busy || !store.loaded} onClick={() => edit()}>새 일정</button>}</div>
    {store.error && <p className="common-error" role="alert">{store.error} <button type="button" onClick={() => void store.refresh()}>다시 불러오기</button></p>}
    {!store.loaded && <p>공통 일정을 불러오는 중입니다.</p>}
    {!form && <div className="common-list">{dayEvents.map(e => <button type="button" key={e.id} className={event?.id === e.id ? "active" : ""} disabled={store.busy} onClick={() => { reset(); setSelected(e.id); }}><time>{e.allDay ? "전일" : e.start}</time><span>{e.title}<small>{eventLabel(e)}{e.cancelled ? " · 취소됨" : ""}</small></span></button>)}{!dayEvents.length && store.loaded && <p className="common-empty">등록된 공통 일정이 없습니다.</p>}</div>}
    {form ? <form onSubmit={submit} className="common-form"><fieldset disabled={busy}>
      <div className="common-segments" role="group" aria-label="일정 종류">{([['meeting','회의'],['meal','회식']] as const).map(([kind,label]) => <button type="button" key={kind} aria-pressed={form.fields.kind === kind} className={form.fields.kind === kind ? "active" : ""} onClick={() => update({ kind })}>{label}</button>)}</div>
      {form.fields.kind === "meal" && <fieldset className="common-meal-options"><legend>회식 시간대</legend><div>{([['lunch','중식'],['dinner','석식']] as const).map(([meal,label]) => <label key={meal}><input type="radio" name="meal" value={meal} checked={form.fields.meal === meal} onChange={() => update({ meal })} /><span>{label}</span></label>)}</div></fieldset>}
      <label>제목<input aria-label="공통 일정 제목" required maxLength={100} value={form.fields.title} onChange={e => update({ title: e.target.value })} /></label>
      <div className="common-form-pair"><label>시작일<input type="date" required min="2000-01-01" max="2099-12-31" value={form.fields.date} onChange={e => update({ date: e.target.value, endDate: !form.fields.endDate || form.fields.endDate < e.target.value ? e.target.value : form.fields.endDate })} /></label><label>종료일<input type="date" required min={form.fields.date} max="2099-12-31" value={form.fields.endDate ?? form.fields.date} onChange={e => update({ endDate: e.target.value })} /></label></div>
      <p className="common-note" role="status">선택 기간: {eventDateLabel(form.fields)} · 시작일과 종료일을 포함하여 {form.fields.allDay ? "매일 전일 일정으로 적용됩니다." : "매일 같은 시간에 적용됩니다."} 주말도 포함됩니다.</p>
      <label>장소 (선택)<input maxLength={160} value={form.fields.location} onChange={e => update({ location: e.target.value })} /></label>
      <label className="common-check"><input type="checkbox" checked={!!form.fields.allDay} onChange={e => update({ allDay: e.target.checked, start: form.fields.start || "14:00", end: form.fields.end || "15:00" })} />시간 미지정 (전일)</label>
      {!form.fields.allDay && <div className="common-form-pair"><label>시작 시각<input type="time" required value={form.fields.start} onChange={e => update({ start: e.target.value })} /></label><label>종료 시각<input type="time" required value={form.fields.end} onChange={e => update({ end: e.target.value })} /></label></div>}
      <div className="common-targets"><label className="common-check"><input type="checkbox" checked={allTargets.length > 0 && allTargets.every(m => form.fields.targetIds.includes(m.id))} onChange={e => update({ targetIds: e.target.checked ? allTargets.map(m => m.id) : [] })} />전체 대상 {allTargets.length}명</label><div>{allTargets.map(m => <label key={m.id} className="common-check"><input type="checkbox" checked={form.fields.targetIds.includes(m.id)} onChange={e => update({ targetIds: e.target.checked ? [...form.fields.targetIds, m.id] : form.fields.targetIds.filter(id => id !== m.id) })} />{m.name}{!m.active ? " (비활성)" : ""}</label>)}</div></div>
      <label>안내 내용 (선택)<textarea rows={2} maxLength={2000} value={form.fields.notes} onChange={e => update({ notes: e.target.value })} /></label>
      {conflict && <div className="common-error"><p>입력 내용이 보존되어 있습니다. 최신 일정을 확인해주세요.</p><button type="button" onClick={() => { const latest = store.events.find(e => e.id === form.id); if (latest) { setForm(newForm(date, members, latest)); setConflict(false); setError(""); } }}>최신 일정 다시 불러오기</button></div>}
      <div className="common-actions"><button type="button" className="secondary-button" onClick={reset}>취소</button><button type="submit" className="primary-button" disabled={busy || conflict || !store.loaded}>{store.busy ? "저장 중…" : form.revision ? "변경 저장" : "공통 일정 등록"}</button></div>
    </fieldset></form> : event && <>
      <div className="common-detail"><h3>{event.title}</h3><p className="common-note">{eventLabel(event)} · 등록자 {event.creatorName}{event.cancelled ? " · 취소됨" : ""}</p><dl><dt>기간</dt><dd>{eventDateLabel(event)}</dd><dt>시간 (매일)</dt><dd>{eventTimeLabel(event)}</dd><dt>장소</dt><dd>{event.location || "미정"}</dd><dt>대상</dt><dd>{event.targets.length}명</dd></dl>{event.notes && <p className="common-notes">{event.notes}</p>}</div>
      {mode === "cancel" ? <form onSubmit={cancel} className="common-form"><label>취소 사유<input required maxLength={240} value={cancelReason} disabled={busy} onChange={e => { setCancelReason(e.target.value); setRequestId(crypto.randomUUID()); }} /></label><p className="common-note">선택한 일정의 전체 기간이 취소되며, 변경 이력은 보존됩니다.</p><div className="common-actions"><button type="button" disabled={busy} onClick={reset}>돌아가기</button><button className="secondary-button" type="submit" disabled={busy}>일정 취소 확정</button></div></form> : <>
        <div className="common-actions"><button type="button" className="secondary-button small" onClick={() => setMode(mode === "history" ? "detail" : "history")}>{mode === "history" ? "주간 현황" : "공통 일정 이력"}</button>{owner && !event.cancelled && <><button type="button" className="secondary-button small" disabled={busy} onClick={() => edit(event)}>일정 수정</button><button type="button" className="secondary-button small" disabled={busy} onClick={() => { setCancelRevision(event.revision); setRequestId(crypto.randomUUID()); setError(""); setMode("cancel"); }}>일정 취소</button></>}</div>
      </>}
    </>}
    {error && <p className="common-error" role="alert">{error}</p>}<p className="common-save-status" role="status">{store.busy ? "저장 중…" : store.saved}</p>
  </aside><section className="day-detail-right">
    {!form && event && mode === "history" ? <><h3>공통 일정 변경 이력</h3><ol className="common-history">{history.map(h => <li key={h.id}><time>{formatAt(h.at)}</time><strong>{h.text}</strong>{h.before && <small>변경 전: {h.before}</small>}<small>{h.detail}</small></li>)}</ol></> : <WeekContext date={form?.fields.date || date} endDate={form ? form.fields.endDate : event?.endDate ?? date} onSelect={form && !busy ? (date, endDate) => update({ date, endDate }) : undefined} members={members} absences={absences} assignments={assignments} />}
  </section></div>;
}
