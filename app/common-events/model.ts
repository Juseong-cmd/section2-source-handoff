import type { Member } from "../data";

export type EventFields = {
  title: string; kind: "meeting" | "meal"; meal: "lunch" | "dinner";
  date: string; endDate?: string; allDay?: boolean; start: string; end: string; location: string; notes: string;
  responseMode: "confirm" | "attendance"; deadline: string;
  targets: { id: string; name: string }[];
};
export type EventHistory = { id: string; at: string; actorId: string; actorName: string; action: "create" | "edit" | "cancel"; reason: string; before: EventFields | null; after: EventFields };
export type CommonEvent = EventFields & { id: string; revision: number; creatorId: string; creatorName: string; cancelled: boolean; history: EventHistory[] };
export const REPLIES = { confirmed: "확인 완료", attending: "참석", declined: "불참", tentative: "미정" } as const;
export type Reply = keyof typeof REPLIES;
export type ResponseHistory = { id: string; at: string; actorName: string; eventRevision: number; status: Reply };
export type CommonResponse = { id: string; eventId: string; memberId: string; revision: number; eventRevision: number; status: Reply; history: ResponseHistory[] };
type Envelope = { eventId: string; actorId: string; revision: number; requestId: string };
export type EventDraft = Omit<EventFields, "targets"> & { targetIds: string[] };
export type EventCommand = Envelope & (
  { kind: "save"; fields: EventDraft } |
  { kind: "cancel"; reason: string } |
  { kind: "respond"; eventRevision: number; status: Reply }
);

export class EventFailure extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
export function parseEventCommand(value: unknown): EventCommand | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (!id(c.eventId) || !id(c.actorId) || !id(c.requestId) || !Number.isSafeInteger(c.revision) || Number(c.revision) < 0) return null;
  const common = { eventId: c.eventId, actorId: c.actorId, requestId: c.requestId, revision: c.revision as number };
  if (c.kind === "cancel" && text(c.reason, 240) && c.reason.trim()) return { ...common, kind: "cancel", reason: c.reason.trim() };
  if (c.kind === "respond" && typeof c.status === "string" && Object.hasOwn(REPLIES, c.status) && Number.isSafeInteger(c.eventRevision) && Number(c.eventRevision) > 0) return { ...common, kind: "respond", eventRevision: c.eventRevision as number, status: c.status as Reply };
  if (c.kind !== "save" || !c.fields || typeof c.fields !== "object") return null;
  const f = c.fields as EventDraft;
  if (!text(f.title, 100) || !f.title.trim() || !["meeting", "meal"].includes(f.kind) || !["lunch", "dinner"].includes(f.meal)) return null;
  if (!validDate(f.date) || (f.allDay !== undefined && typeof f.allDay !== "boolean")) return null;
  if (!f.allDay && (!validTime(f.start) || !validTime(f.end) || f.end <= f.start)) return null;
  if (f.endDate !== undefined && (!validDate(f.endDate) || f.endDate < f.date)) return null;
  if (!text(f.location, 160) || !text(f.notes, 2000) || !["confirm", "attendance"].includes(f.responseMode)) return null;
  if (!Array.isArray(f.targetIds) || f.targetIds.length < 1 || f.targetIds.length > 100 || !f.targetIds.every(id) || new Set(f.targetIds).size !== f.targetIds.length) return null;
  if (typeof f.deadline !== "string" || (f.deadline !== "" && (f.deadline.length !== 16 || f.deadline[10] !== "T" || !validDate(f.deadline.slice(0, 10)) || !validTime(f.deadline.slice(11)) || f.deadline > `${f.date}T${f.start}`))) return null;
  return { ...common, kind: "save", fields: { title: f.title.trim(), kind: f.kind, meal: f.kind === "meal" ? f.meal : "lunch", date: f.date, endDate: f.endDate ?? f.date, allDay: f.allDay ?? false, start: f.allDay ? "" : f.start, end: f.allDay ? "" : f.end, location: f.location.trim(), notes: f.notes.trim(), responseMode: f.responseMode, deadline: f.deadline, targetIds: f.targetIds } };
}
export function eventFields(event: CommonEvent): EventFields {
  const { title, kind, meal, date, start, end, location, notes, responseMode, deadline, targets } = event;
  return { title, kind, meal, date, endDate: event.endDate ?? date, allDay: event.allDay ?? false, start, end, location, notes, responseMode, deadline, targets };
}
export function eventOccursOn(event: Pick<EventFields, "date" | "endDate">, date: string) {
  return event.date <= date && (event.endDate ?? event.date) >= date;
}
export function eventDateLabel(event: Pick<EventFields, "date" | "endDate">) {
  return event.endDate && event.endDate !== event.date ? `${event.date} ~ ${event.endDate}` : event.date;
}
export function eventTimeLabel(event: Pick<EventFields, "allDay" | "start" | "end">) { return event.allDay ? "전일" : `${event.start}–${event.end}`; }
export function eventLabel(event: Pick<CommonEvent, "kind" | "meal">) { return event.kind === "meeting" ? "회의" : event.meal === "lunch" ? "회식 · 중식" : "회식 · 석식"; }
export function replyState(event: CommonEvent, reply: CommonResponse | undefined) {
  if (!reply) return "미응답";
  return reply.eventRevision === event.revision ? REPLIES[reply.status] : "재확인 필요";
}
export function responseCounts(event: CommonEvent, responses: CommonResponse[]) {
  const targets = new Set(event.targets.map(t => t.id));
  const relevant = responses.filter(r => r.eventId === event.id && targets.has(r.memberId));
  const current = relevant.filter(r => r.eventRevision === event.revision);
  return { confirmed: current.filter(r => r.status === "confirmed").length, attending: current.filter(r => r.status === "attending").length, declined: current.filter(r => r.status === "declined").length, tentative: current.filter(r => r.status === "tentative").length, stale: relevant.length - current.length, unanswered: event.targets.length - relevant.length };
}

export function saveEvent(before: CommonEvent | null, command: Exclude<EventCommand, { kind: "respond" }>, members: Member[], actor: Member, at: string): CommonEvent {
  if (before && before.creatorId !== actor.id) throw new EventFailure("등록자만 이 일정을 수정하거나 취소할 수 있습니다.", 403);
  if (before?.history.some(h => h.id === command.requestId)) return before;
  if ((before?.revision ?? 0) !== command.revision) throw new EventFailure("일정이 변경됐습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.", 409);
  if (before?.cancelled) throw new EventFailure("취소된 일정은 수정할 수 없습니다.");
  if (command.kind === "cancel") {
    if (!before) throw new EventFailure("일정을 찾을 수 없습니다.", 404);
    return { ...before, revision: before.revision + 1, cancelled: true, history: [...before.history, { id: command.requestId, at, actorId: actor.id, actorName: actor.name, action: "cancel", reason: command.reason, before: eventFields(before), after: eventFields(before) }] };
  }
  const { targetIds, ...fields } = command.fields;
  const targets = targetIds.map(memberId => {
    const current = members.find(m => m.id === memberId && m.active);
    const previous = before?.targets.find(m => m.id === memberId);
    if (!current && !previous) throw new EventFailure("대상자 목록이 변경됐습니다. 팀원 목록을 다시 확인해주세요.");
    return { id: memberId, name: current?.name ?? previous!.name };
  });
  const after = { ...fields, targets };
  if (before && JSON.stringify(eventFields(before)) === JSON.stringify(after)) return before;
  return { ...after, id: command.eventId, revision: (before?.revision ?? 0) + 1, creatorId: before?.creatorId ?? actor.id, creatorName: before?.creatorName ?? actor.name, cancelled: false, history: [...(before?.history ?? []), { id: command.requestId, at, actorId: actor.id, actorName: actor.name, action: before ? "edit" : "create", reason: "", before: before ? eventFields(before) : null, after }] };
}
export function respondToEvent(event: CommonEvent, before: CommonResponse | null, command: Extract<EventCommand, { kind: "respond" }>, actor: Member, at: string): CommonResponse {
  if (!event.targets.some(t => t.id === actor.id)) throw new EventFailure("이 일정의 대상자만 응답할 수 있습니다.", 403);
  if (before?.history.some(h => h.id === command.requestId)) return before;
  if (event.cancelled) throw new EventFailure("취소된 일정에는 응답할 수 없습니다.");
  if (event.revision !== command.eventRevision || (before?.revision ?? 0) !== command.revision) throw new EventFailure("일정 또는 내 응답이 변경됐습니다. 최신 내용을 확인해주세요.", 409);
  if ((event.responseMode === "confirm") !== (command.status === "confirmed")) throw new EventFailure("이 일정의 응답 방식에 맞게 선택해주세요.");
  if (before?.eventRevision === event.revision && before.status === command.status) return before;
  return { id: `${event.id}|${actor.id}`, eventId: event.id, memberId: actor.id, revision: (before?.revision ?? 0) + 1, eventRevision: event.revision, status: command.status, history: [...(before?.history ?? []), { id: command.requestId, at, actorName: actor.name, eventRevision: event.revision, status: command.status }] };
}
