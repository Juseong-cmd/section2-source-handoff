import type { Absence } from "../data";
import { attendanceImpact } from "../attendance-display.ts";

export const BAY_NAMES = ["Wet", "Etch", "Fusion"] as const;
export type Bay = typeof BAY_NAMES[number];
export type BayBackup = { id: string; bay: Bay; start: string; end: string; reason: string; cancelled: boolean };
export type BayHistory = {
  id: string; at: string; actorId: string; actorName: string; memberName: string;
  action: "base" | "carry" | "backup" | "cancel"; before: string; after: string;
  start: string; end: string; reason: string;
};
// A member's assignments and audit trail share one atomic database record.
export type BaySchedule = { id: string; revision: number; months: Record<string, Bay | "">; backups: BayBackup[]; history: BayHistory[] };
export type BayCommand = { memberId: string; actorId: string; revision: number; requestId: string; reason: string } & (
  { kind: "base"; month: string; bay: Bay | "" } |
  { kind: "carry"; month: string } |
  { kind: "backup"; start: string; end: string; bay: Bay; acknowledgePartial?: boolean } |
  { kind: "cancel"; backupId: string }
);
export const emptySchedule = (id: string): BaySchedule => ({ id, revision: 0, months: {}, backups: [], history: [] });
export const baseBay = (schedule: BaySchedule | undefined, date: string) => schedule?.months[date.slice(0, 7)] || "";
export const previousMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
export const canCarry = (schedule: BaySchedule | undefined, month: string) => !!schedule && !Object.hasOwn(schedule.months, month) && !!schedule.months[previousMonth(month)];
export const activeBackup = (schedule: BaySchedule | undefined, date: string) => schedule?.backups.find(b => !b.cancelled && b.start <= date && b.end >= date);
export const effectiveBay = (schedule: BaySchedule | undefined, date: string) => activeBackup(schedule, date)?.bay || baseBay(schedule, date);
export const overlaps = (start: string, end: string, otherStart: string, otherEnd: string) => start <= otherEnd && end >= otherStart;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseBayCommand(raw: unknown): BayCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (![c.memberId, c.actorId, c.requestId].every(v => typeof v === "string" && v.length > 0 && v.length <= 120)) return null;
  if (!Number.isSafeInteger(c.revision) || Number(c.revision) < 0 || typeof c.reason !== "string" || !c.reason.trim() || c.reason.length > 240) return null;
  if (c.kind === "base" && typeof c.month === "string" && validDate(`${c.month}-01`) && (c.bay === "" || BAY_NAMES.includes(c.bay as Bay))) return { ...c, reason: c.reason.trim() } as BayCommand;
  if (c.kind === "carry" && typeof c.month === "string" && validDate(`${c.month}-01`)) return { ...c, reason: c.reason.trim() } as BayCommand;
  if (c.kind === "backup" && validDate(c.start) && validDate(c.end) && c.start <= c.end && BAY_NAMES.includes(c.bay as Bay)) return { ...c, reason: c.reason.trim() } as BayCommand;
  if (c.kind === "cancel" && typeof c.backupId === "string" && c.backupId.length > 0 && c.backupId.length <= 120) return { ...c, reason: c.reason.trim() } as BayCommand;
  return null;
}

export function applyBayCommand(schedule: BaySchedule, command: BayCommand, absences: Absence[], actorName: string, memberName: string, at: string): BaySchedule {
  if (schedule.history.some(h => h.id === command.requestId)) return schedule;
  if (schedule.revision !== command.revision) throw new Error("다른 사용자가 이 팀원의 Bay를 변경했습니다. 최신 배정을 확인한 뒤 다시 저장해주세요.");
  let next = { ...schedule };
  const reason = command.kind === "backup" && command.acknowledgePartial === true ? `${command.reason} · 부분 근무 지원 시간 확인` : command.reason;
  let before: string, after: string, start: string, end: string;
  if (command.kind === "base" || command.kind === "carry") {
    if (command.kind === "carry" && !canCarry(schedule, command.month)) throw new Error("이미 설정한 월은 덮어쓰지 않습니다. 지난달 배정과 현재 월 설정을 확인해주세요.");
    before = schedule.months[command.month] || "미배정";
    const bay = command.kind === "carry" ? schedule.months[previousMonth(command.month)] : command.bay;
    after = bay || "미배정";
    if (before === after) return schedule;
    start = `${command.month}-01`;
    end = new Date(Date.UTC(Number(command.month.slice(0, 4)), Number(command.month.slice(5)), 0)).toISOString().slice(0, 10);
    next.months = { ...schedule.months, [command.month]: bay };
  } else if (command.kind === "backup") {
    if (schedule.backups.some(b => !b.cancelled && overlaps(b.start, b.end, command.start, command.end))) throw new Error("이미 백업이 배정된 기간입니다. 기존 백업을 취소하거나 기간을 조정해주세요.");
    const attendance = absences.filter(a => a.memberId === command.memberId && overlaps(a.startDate, a.endDate, command.start, command.end));
    if (attendance.some(a => attendanceImpact(a) === "away")) throw new Error("종일 부재 일정과 겹칩니다. 다른 담당자 또는 기간을 선택해주세요.");
    if (attendance.some(a => attendanceImpact(a) === "check") && command.acknowledgePartial !== true) throw new Error("부분 근무 또는 직접 입력 일정이 있습니다. 실제 지원 가능한 시간을 확인해주세요.");
    before = baseBay(schedule, command.start) || "미배정";
    after = command.bay;
    if (before === after && command.start.slice(0, 7) === command.end.slice(0, 7)) throw new Error("기본 Bay와 같습니다. 다른 Bay를 선택해주세요.");
    start = command.start; end = command.end;
    next.backups = [...schedule.backups, { id: command.requestId, bay: command.bay, start, end, reason, cancelled: false }];
  } else {
    const item = schedule.backups.find(b => b.id === command.backupId && !b.cancelled);
    if (!item) throw new Error("이미 취소되었거나 찾을 수 없는 백업입니다.");
    before = item.bay; after = "월 기본 배정"; start = item.start; end = item.end;
    next.backups = schedule.backups.map(b => b.id === item.id ? { ...b, cancelled: true } : b);
  }
  return { ...next, revision: schedule.revision + 1, history: [...schedule.history, { id: command.requestId, at, actorId: command.actorId, actorName, memberName, action: command.kind, before, after, start, end, reason }] };
}
