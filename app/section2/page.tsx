"use client";

import { CSSProperties, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Absence,
  AbsenceType,
  AuditLog,
  Member,
  OvertimeAssignment,
  absenceLabels,
  reservedMemberNames,
  useAppData,
} from "../store";
import { CommentThread } from "../comment-thread";
import { isoParts, millisecondsUntilNextKstDate, todayIsoKst, weekdayFromIso } from "../date-utils";
import { datesBetween, getHolidayName, toIso } from "../calendar-holidays";
import { appHasBay, appHasCommonEvents, appHasOvertime, appTitle } from "../site-config";
import { CommonEventWorkspace, EventBadges } from "../common-events/CommonEvents";
import { eventOccursOn, eventDateLabel } from "../common-events/model";
import { useCommonEvents, type CommonEventStore } from "../common-events/useCommonEvents";
import { BayDaySummary, BayWorkspace } from "../bay/BayWorkspace";
import { useBay } from "../bay/useBay";
import { StatusControls, WorkerGate } from "../status-controls";
import { CharacterReaction } from "../lounge/CharacterReaction";
import { defaultProfile } from "../lounge/service";

import { attendanceLabel } from "../attendance-display";
import { attendanceLanes, mergedAttendance } from "../attendance-lanes";

type ViewMode = "attendance" | "overtime" | "both";
type CalendarView = "month" | "members";
type CalendarDay = {
  date: Date;
  iso: string;
  day: number;
  weekday: number;
  inMonth: boolean;
  isToday: boolean;
};

const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
const modes: { value: ViewMode; label: string }[] = [
  { value: "attendance", label: "근태" },
  { value: "overtime", label: "잔업" },
  { value: "both", label: "통합" },
];
const absenceTypes: AbsenceType[] = ["annual", "training", "flex", "family", "etc"];

function buildCalendar(year: number, month: number, today: string) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.max(35, Math.ceil((first.getDay() + daysInMonth) / 7) * 7);

  return Array.from({ length: cellCount }, (_, index): CalendarDay => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      iso: toIso(date),
      day: date.getDate(),
      weekday: date.getDay(),
      inMonth: date.getMonth() === month,
      isToday: toIso(date) === today,
    };
  });
}

function addIsoDays(iso: string, amount: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toIso(date);
}

function startOfWeekIso(iso: string) {
  return addIsoDays(iso, -weekdayFromIso(iso));
}

function buildWeek(startIso: string, today: string): CalendarDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const iso = addIsoDays(startIso, index);
    const parts = isoParts(iso);
    const date = new Date(parts.year, parts.month, parts.day);
    return {
      date,
      iso,
      day: parts.day,
      weekday: index,
      inMonth: true,
      isToday: iso === today,
    };
  });
}

function buildWorkWeek(anchorIso: string): CalendarDay[] {
  const weekday = weekdayFromIso(anchorIso);
  const monday = addIsoDays(anchorIso, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 5 }, (_, index) => {
    const iso = addIsoDays(monday, index);
    const parts = isoParts(iso);
    const date = new Date(parts.year, parts.month, parts.day);
    return {
      date,
      iso,
      day: parts.day,
      weekday: weekdayFromIso(iso),
      inMonth: true,
      isToday: iso === anchorIso,
    };
  });
}

function overlapsDate(absence: Absence, date: string) {
  return absence.startDate <= date && absence.endDate >= date;
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function ModeSwitch({ value, onChange, hasOvertime }: { value: ViewMode; onChange: (mode: ViewMode) => void; hasOvertime: boolean }) {
  const availableModes = hasOvertime ? modes : modes.filter((mode) => mode.value === "attendance");
  if (availableModes.length <= 1) return null;

  return (
    <div className="mode-switch">
      {availableModes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          className={mode.value === value ? "active" : ""}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function Header({
  viewMode,
  onViewModeChange,
  onNavigateAway,
  hasOvertime,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigateAway: () => void;
  hasOvertime: boolean;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-row">
          <a className="brand" href="/" aria-label={appTitle}>
            <span className="section-theme-wordmark">SECTION2</span>
            <span className="brand-divider" />
            <span className="brand-label">{appTitle}</span>
          </a>
          <div className="desktop-mode">
            <ModeSwitch value={viewMode} onChange={onViewModeChange} hasOvertime={hasOvertime} />
          </div>
          <nav className="primary-nav" aria-label="주요 메뉴">
            <a className="active" href="/">
              캘린더
            </a>
            <a href="/lounge" onPointerDown={onNavigateAway} onClick={onNavigateAway}>
              라운지
            </a>
            <a href="/feedback" onPointerDown={onNavigateAway} onClick={onNavigateAway}>
              게시판
            </a>
            <a href="/admin" onPointerDown={onNavigateAway} onClick={onNavigateAway}>
              관리
            </a>
          </nav>
        </div>
        <div className="mobile-mode">
          <ModeSwitch value={viewMode} onChange={onViewModeChange} hasOvertime={hasOvertime} />
        </div>
      </div>
    </header>
  );
}

const absenceDisplayLabel = attendanceLabel;

function auditActionCoversDate(action: string, date: string) {
  if (!/^(?:부재 (?:등록|수정|삭제)|잔업 (?:등록|해제|확정))/.test(action)) return false;
  const dates = action.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (dates.length >= 2) return dates[0]! <= date && date <= dates[1]!;
  return dates[0] === date;
}

function absenceStatusClass(type: AbsenceType) {
  if (type === "annual" || type === "family") return "annual";
  if (type === "training") return "training";
  if (type === "flex") return "flex";
  return "etc";
}

function overtimeMethodLabel(method: OvertimeAssignment["method"]) {
  if (method === "random") return "랜덤 추첨";
  if (method === "agree") return "합의 지정";
  return "직접 등록";
}

function MemberNameTag({ name, color, title }: { name: string; color: string; title: string }) {
  return (
    <span
      className="calendar-member-name"
      style={{ "--member-color": color, backgroundColor: `${color}18` } as CSSProperties}
      title={title}
    >
      <i style={{ backgroundColor: color }} aria-hidden="true" />
      {name}
    </span>
  );
}

function AttendanceGroups({ absences, membersById }: { absences: Absence[]; membersById: Map<string, Member> }) {
  const groups = Array.from(
    absences.reduce((result, absence) => {
      const label = absenceDisplayLabel(absence);
      const group = result.get(label) ?? [];
      group.push(absence);
      result.set(label, group);
      return result;
    }, new Map<string, Absence[]>()),
  );

  return (
    <div className="attendance-groups">
      {groups.map(([label, items]) => (
        <div className="attendance-group" key={label}>
          <div className="attendance-group-label" title={label}>
            <strong>{label}</strong>
            <span>{items.length}명</span>
          </div>
          <div className="calendar-member-names">
            {items.map((absence) => {
              const member = membersById.get(absence.memberId);
              return (
                <MemberNameTag
                  key={absence.id}
                  name={member?.name ?? "?"}
                  color={member?.color ?? "#1428A0"}
                  title={`${member?.name ?? "?"} · ${label}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OvertimeGroup({ assignments, membersById }: { assignments: OvertimeAssignment[]; membersById: Map<string, Member> }) {
  if (assignments.length === 0) return null;

  return (
    <div className="calendar-overtime-group">
      <div className="attendance-group-label overtime-group-label">
        <strong>잔업</strong>
        <span>{assignments.length}명</span>
      </div>
      <div className="calendar-member-names">
        {assignments.map((assignment) => {
          const member = membersById.get(assignment.memberId);
          return (
            <MemberNameTag
              key={assignment.id}
              name={member?.name ?? "?"}
              color={member?.color ?? "#1428A0"}
              title={`${member?.name ?? "?"} · 잔업`}
            />
          );
        })}
      </div>
    </div>
  );
}

function CalendarCell({
  laneCount = 0,
  column,
  commonBadges,
  day,
  viewMode,
  membersById,
  absences,
  assignments,
  hasOvertime,
  selecting,
  onSelect,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  laneCount?: number;
  column?: number;
  commonBadges?: ReactNode;
  day: CalendarDay;
  viewMode: ViewMode;
  membersById: Map<string, Member>;
  absences: Absence[];
  assignments: OvertimeAssignment[];
  hasOvertime: boolean;
  selecting: boolean;
  onSelect: (date: string) => void;
  onPointerDown: (date: string) => void;
  onPointerEnter: (date: string) => void;
  onPointerUp: () => void;
}) {
  const holiday = getHolidayName(day.date);
  const colorClass = holiday || day.weekday === 0 ? "danger" : day.weekday === 6 ? "section-theme" : "";
  const showAttendance = viewMode === "attendance" || viewMode === "both";
  const showOvertime = hasOvertime && (viewMode === "overtime" || viewMode === "both");

  return (
    <button
      type="button"
      style={column !== undefined ? { gridColumn: column + 1, gridRow: `1 / ${laneCount + 4}` } : undefined}
      aria-label={`${day.iso}${showAttendance ? absences.map(a => ` ${membersById.get(a.memberId)?.name || ""} ${absenceDisplayLabel(a)}`).join(",") : ""}`}
      onClick={() => onSelect(day.iso)}
      onPointerDown={(event) => {
        event.preventDefault();
        onPointerDown(day.iso);
      }}
      onPointerEnter={() => onPointerEnter(day.iso)}
      onPointerUp={onPointerUp}
      className={[
        "calendar-cell",
        day.inMonth ? "in-month" : "out-month",
        day.isToday ? "today" : "",
        selecting ? "selecting" : "",
      ].join(" ")}
    >
      <div className="date-line">
        <span className={["date-number", colorClass].filter(Boolean).join(" ")}>{day.day}</span>
        {holiday ? <span className={["holiday", day.inMonth ? "" : "muted"].join(" ")}>{holiday}</span> : null}
      </div>
      <div className="cell-tags">
        {commonBadges}
        {showAttendance && column === undefined ? <AttendanceGroups absences={absences} membersById={membersById} /> : null}
        {showOvertime ? <OvertimeGroup assignments={assignments} membersById={membersById} /> : null}
      </div>
    </button>
  );
}

function MemberWeekView({
  days,
  members,
  absences,
  assignments,
  viewMode,
  hasOvertime,
  onSelect,
}: {
  days: CalendarDay[];
  members: Member[];
  absences: Absence[];
  assignments: OvertimeAssignment[];
  viewMode: ViewMode;
  hasOvertime: boolean;
  onSelect: (date: string) => void;
}) {
  const showAttendance = viewMode === "attendance" || viewMode === "both";
  const showOvertime = hasOvertime && (viewMode === "overtime" || viewMode === "both");

  return (
    <div className="member-week-scroll">
      <div className="member-week-table">
        <div className="member-week-row member-week-header">
          <div className="member-week-person">사용자</div>
          {days.map((day) => {
            const holiday = getHolidayName(day.date);
            return (
              <div key={day.iso} className={["member-week-date", holiday ? "holiday-column" : "", day.isToday ? "today-column" : ""].join(" ")}>
                <span>
                  {weekDays[day.weekday]}
                  {holiday ? <em>{holiday}</em> : null}
                </span>
                <strong>{day.date.getMonth() + 1}월 {day.day}일</strong>
              </div>
            );
          })}
        </div>
        {members.map((member) => (
          <div className="member-week-row" key={member.id}>
            <div className="member-week-person" style={{ "--member-color": member.color } as CSSProperties}>
              <i aria-hidden="true" />
              <strong>{member.name}</strong>
            </div>
            {days.map((day) => {
              const dayAbsences = showAttendance
                ? absences.filter((absence) => absence.memberId === member.id && overlapsDate(absence, day.iso))
                : [];
              const dayAssignments = showOvertime
                ? assignments.filter((assignment) => assignment.memberId === member.id && assignment.date === day.iso)
                : [];
              const holiday = getHolidayName(day.date);
              const hasStatus = dayAbsences.length > 0 || dayAssignments.length > 0;

              return (
                <button
                  type="button"
                  key={day.iso}
                  className={["member-week-status", holiday ? "holiday-column" : "", day.isToday ? "today-column" : ""].join(" ")}
                  onClick={() => onSelect(day.iso)}
                  aria-label={`${member.name} ${day.iso} 상세`}
                >
                  {dayAbsences.map((absence) => (
                    <span className="member-week-badge" key={absence.id} style={{ "--member-color": member.color } as CSSProperties}>
                      {absenceDisplayLabel(absence)}
                    </span>
                  ))}
                  {dayAssignments.map((assignment) => (
                    <span className="member-week-badge overtime" key={assignment.id} style={{ "--member-color": member.color } as CSSProperties}>
                      잔업
                    </span>
                  ))}
                  {!hasStatus ? <span className="member-week-empty">-</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="member-week-note">
        <span><strong>사용자 색상</strong>으로 사람을 구분합니다.</span>
        <span><strong>전체 유형명</strong>으로 근태 내용을 확인합니다.</span>
        <span><strong>날짜 셀</strong>을 누르면 등록·수정 화면이 열립니다.</span>
      </div>
    </div>
  );
}

function AbsenceModal({
  open,
  members,
  registrationMember,
  defaultDate,
  defaultEndDate,
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  members: Member[];
  registrationMember?: Member;
  defaultDate: string;
  defaultEndDate?: string;
  editing?: Absence | null;
  onClose: () => void;
  onSave: (absence: Omit<Absence, "id">) => void;
  onDelete?: () => void;
}) {
  const [memberId, setMemberId] = useState(editing?.memberId ?? registrationMember?.id ?? "");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultEndDate ?? defaultDate);
  const [type, setType] = useState<AbsenceType>("annual");
  const [label, setLabel] = useState("");
  const [flexTime, setFlexTime] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!open) return;
    setMemberId(editing?.memberId ?? registrationMember?.id ?? "");
    setStartDate(editing?.startDate ?? defaultDate);
    setEndDate(editing?.endDate ?? defaultEndDate ?? defaultDate);
    setType(editing?.type ?? "annual");
    setLabel(editing?.label ?? "");
    setFlexTime(editing?.flexTime ?? "");
    setMemo(editing?.memo ?? "");
  }, [open, defaultDate, defaultEndDate, registrationMember, editing]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (type === "flex" && !flexTime) return;
    if (!memberId || endDate < startDate) return;
    onSave({ memberId, startDate, endDate, type, label: label.trim(), memo: memo.trim(), flexTime: type === "flex" ? flexTime : "" });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <h2>{editing ? "부재 수정" : "부재 등록"}</h2>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <label className="field-label">사용자</label>
        {!editing && registrationMember ? (
          <div className="selected-user-row">
            <span style={{ backgroundColor: registrationMember.color }} />
            <strong>{registrationMember.name}</strong>
          </div>
        ) : (
          <div className="chip-row">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setMemberId(member.id)}
                className={memberId === member.id ? "selected" : ""}
              >
                {member.name}
              </button>
            ))}
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>시작일</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>종료일</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <label className="field-label">유형</label>
        <div className="chip-row">
          {absenceTypes.map((item) => (
            <button key={item} type="button" onClick={() => setType(item)} className={type === item ? "selected" : ""}>
              {absenceLabels[item]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>유형 직접 입력 (선택)</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="비워두면 위 유형이 표시됩니다 - 예: 건강검진, 출장" />
        </label>
        {type === "flex" ? (
          <label className="field">
            <span>자출 시간</span>
            <input type="time" value={flexTime} onChange={(event) => setFlexTime(event.target.value)} required />
          </label>
        ) : null}
        <label className="field">
          <span>메모 (선택)</span>
          <textarea rows={2} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 오전 반차" />
        </label>
        <div className="modal-actions">
          {editing ? (
            <button type="button" className="danger-button" onClick={onDelete}>
              삭제
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button">
            {editing ? "저장" : "등록"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RangeModal({
  start,
  end,
  member,
  hasOvertime,
  onClose,
  onRegisterAbsence,
  onRegisterOvertime,
  onRegisterCommon,
}: {
  start: string;
  end: string;
  member?: Member;
  hasOvertime: boolean;
  onClose: () => void;
  onRegisterAbsence: () => void;
  onRegisterCommon?: () => void;
  onRegisterOvertime: (memberId: string, dates: string[]) => boolean;
}) {
  const [includeWeekendHoliday, setIncludeWeekendHoliday] = useState(true);
  const dates = datesBetween(start, end, includeWeekendHoliday);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <h2>
            {start} ~ {end}
          </h2>
          <button type="button" className="icon-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <button type="button" className="primary-button full" onClick={onRegisterAbsence}>
          이 기간에 부재 등록
        </button>
        {onRegisterCommon && <section className="modal-section"><button type="button" className="primary-button full" disabled={!member} onClick={onRegisterCommon}>이 기간에 공통 일정 등록</button></section>}
        {hasOvertime ? (
          <section className="modal-section">
            <h3>이 기간에 잔업 등록</h3>
            {member ? (
              <div className="selected-user-row">
                <span style={{ backgroundColor: member.color }} />
                <strong>{member.name}</strong>
              </div>
            ) : null}
            <label className="check-row">
              <input
                type="checkbox"
                checked={includeWeekendHoliday}
                onChange={(event) => setIncludeWeekendHoliday(event.target.checked)}
              />
              주말·공휴일도 포함
            </label>
            <button
              type="button"
              className="primary-button full"
              disabled={!member || dates.length === 0}
              onClick={() => {
                if (member && onRegisterOvertime(member.id, dates)) onClose();
              }}
            >
              이 기간에 내 잔업 등록
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function DateModal({
  date,
  hasOvertime,
  members,
  absences,
  assignments,
  auditLogs,
  currentMember,
  onClose,
  onAddAbsence,
  onUpdateAbsence,
  onDeleteAbsence,
  onAddAssignment,
  onDeleteAssignment,
  baySummary,
  common,
}: {
  date: string;
  hasOvertime: boolean;
  members: Member[];
  absences: Absence[];
  assignments: OvertimeAssignment[];
  auditLogs: AuditLog[];
  currentMember?: Member;
  onClose: () => void;
  onAddAbsence: (absence: Omit<Absence, "id">) => void;
  onUpdateAbsence: (id: string, absence: Omit<Absence, "id">) => void;
  onDeleteAbsence: (id: string) => boolean;
  onAddAssignment: (memberId: string) => boolean;
  onDeleteAssignment: (id: string) => boolean;
  baySummary?: ReactNode;
  common?: { store: CommonEventStore; open: boolean; intent: string; endDate?: string; onToggle: (open: boolean) => void; onSaved: (date: string, id: string) => void };
}) {
  const [expandedPanel, setExpandedPanel] = useState<"register" | "history" | null>(null);
  const [registerMode, setRegisterMode] = useState<"attendance" | "overtime">("attendance");
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [type, setType] = useState<AbsenceType>("annual");
  const [label, setLabel] = useState("");
  const [flexTime, setFlexTime] = useState("");
  const [memo, setMemo] = useState("");
  const week = useMemo(() => buildWorkWeek(date), [date]);
  const activeMemberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const dateAbsences = absences.filter((absence) => activeMemberIds.has(absence.memberId) && overlapsDate(absence, date));
  const dateAssignments = assignments.filter((assignment) => activeMemberIds.has(assignment.memberId) && assignment.date === date);
  const absentIds = new Set(dateAbsences.map((absence) => absence.memberId));
  const overtimeIds = new Set(dateAssignments.map((assignment) => assignment.memberId));
  const exceptionIds = new Set([...Array.from(absentIds), ...Array.from(overtimeIds)]);
  const overlapCount = Array.from(absentIds).filter((memberId) => overtimeIds.has(memberId)).length;
  const currentAssignment = dateAssignments.find((assignment) => assignment.memberId === currentMember?.id);
  const history = auditLogs.filter((log) => auditActionCoversDate(log.action, date)).slice(0, 6);
  const selectedParts = isoParts(date);
  const weekdayLabel = weekDays[weekdayFromIso(date)];
  const exceptionMembers = members.filter((member) => exceptionIds.has(member.id));
  const weekMembers = members;

  useEffect(() => {
    setExpandedPanel(null);
    setRegisterMode("attendance");
    setEditingAbsenceId(null);
    setStartDate(date);
    setEndDate(date);
    setType("annual");
    setLabel("");
    setFlexTime("");
    setMemo("");
  }, [date]);

  function resetAbsenceForm() {
    setEditingAbsenceId(null);
    setStartDate(date);
    setEndDate(date);
    setType("annual");
    setLabel("");
    setFlexTime("");
    setMemo("");
  }

  function openRegister(mode: "attendance" | "overtime" = "attendance") {
    resetAbsenceForm();
    setRegisterMode(mode);
    setExpandedPanel("register");
  }

  function editAbsence(absence: Absence) {
    if (absence.memberId !== currentMember?.id) return;
    setEditingAbsenceId(absence.id);
    setStartDate(absence.startDate);
    setEndDate(absence.endDate);
    setType(absence.type);
    setLabel(absence.label);
    setFlexTime(absence.flexTime ?? "");
    setMemo(absence.memo);
    setRegisterMode("attendance");
    setExpandedPanel("register");
  }

  function submitAbsence(event: FormEvent) {
    event.preventDefault();
    if (!currentMember || endDate < startDate || (type === "flex" && !flexTime)) return;
    const absence = {
      memberId: currentMember.id,
      startDate,
      endDate,
      type,
      label: label.trim(),
      memo: memo.trim(),
      flexTime: type === "flex" ? flexTime : "",
    };
    if (editingAbsenceId) onUpdateAbsence(editingAbsenceId, absence);
    else onAddAbsence(absence);
    resetAbsenceForm();
    setExpandedPanel(null);
  }

  function deleteEditingAbsence() {
    if (!editingAbsenceId || !onDeleteAbsence(editingAbsenceId)) return;
    resetAbsenceForm();
    setExpandedPanel(null);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="day-detail-modal">
        <div className="day-detail-head">
          <h2>
            {selectedParts.year}.{String(selectedParts.month + 1).padStart(2, "0")}.{String(selectedParts.day).padStart(2, "0")} {weekdayLabel}요일
          </h2>
          <div>
            <span>선택일</span>
            <button type="button" className="icon-close" aria-label="닫기" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        {common && <div className="common-date-tabs" role="tablist" aria-label="개인 및 공통 일정"><button type="button" role="tab" aria-selected={!common.open} className={!common.open ? "active" : ""} onClick={() => common.onToggle(false)}>{hasOvertime ? "근태·잔업" : "근태"}</button><button type="button" role="tab" aria-selected={common.open} className={common.open ? "active" : ""} onClick={() => common.onToggle(true)}>공통 일정 {common.store.events.filter(e => eventOccursOn(e, date) && !e.cancelled).length}</button></div>}
        {common?.open ? <CommonEventWorkspace date={date} initialEndDate={common.endDate} store={common.store} members={members} absences={absences} assignments={assignments} actorId={currentMember?.id} intent={common.intent} onSaved={common.onSaved} /> : <div className="day-detail-body">
          <aside className="day-detail-left">
            <div className="day-workspace-tabs" role="tablist" aria-label="선택일 상세 화면">
              <button
                type="button"
                role="tab"
                aria-selected={expandedPanel === null}
                className={expandedPanel === null ? "active" : ""}
                onClick={() => {
                  resetAbsenceForm();
                  setExpandedPanel(null);
                }}
              >
                {hasOvertime ? "근태·잔업 현황" : "근태 현황"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={expandedPanel === "register"}
                className={expandedPanel === "register" ? "active" : ""}
                disabled={!currentMember}
                onClick={() => openRegister("attendance")}
              >
                내 일정 등록
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={expandedPanel === "history"}
                className={expandedPanel === "history" ? "active" : ""}
                onClick={() => setExpandedPanel("history")}
              >
                변경 이력
              </button>
            </div>

            {expandedPanel === null ? (
              <section className="day-workspace-panel">
                <div className="day-detail-section-head">
                  <h3>오늘 현황</h3>
                  <span>팀 {members.length}명 · 선택일 기준</span>
                </div>
                <div className={["day-summary", hasOvertime ? "" : "attendance-only"].join(" ")}>
                  <div className="day-summary-card work">
                    <b>{Math.max(0, members.length - absentIds.size)}</b>
                    <span>근무</span>
                  </div>
                  <div className="day-summary-card">
                    <b>{absentIds.size}</b>
                    <span>부재</span>
                  </div>
                  {hasOvertime ? (
                    <>
                      <div className="day-summary-card">
                        <b>{overtimeIds.size}</b>
                        <span>잔업</span>
                      </div>
                      <div className="day-summary-card overlap">
                        <b>{overlapCount}</b>
                        <span>중복 상태</span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="day-detail-section-head status-head">
                  <h3>{hasOvertime ? "근태·잔업 현황" : "근태 현황"}</h3>
                  <span>정상 근무자는 숨김</span>
                </div>
                {exceptionMembers.length === 0 ? (
                  <p className="day-detail-empty">등록된 {hasOvertime ? "근태·잔업" : "근태"} 일정이 없습니다.</p>
                ) : (
                  <div className="day-status-list">
                    {exceptionMembers.map((member) => {
                      const memberAbsences = dateAbsences.filter((absence) => absence.memberId === member.id);
                      const memberAssignment = dateAssignments.find((assignment) => assignment.memberId === member.id);
                      const isCurrentMember = member.id === currentMember?.id;
                      return (
                        <div className="day-status-row" key={member.id}>
                          <strong className={isCurrentMember ? "current" : ""}>
                            <i style={{ backgroundColor: member.color }} aria-hidden="true" />
                            {member.name}{isCurrentMember ? " · 나" : ""}
                          </strong>
                          <div className="day-status-chips">
                            {memberAbsences.map((absence) => (
                              <span key={absence.id} className="day-absence-entry">
                                {isCurrentMember ? <button type="button" className={`day-status-chip ${absenceStatusClass(absence.type)}`} aria-label={`${absenceDisplayLabel(absence)} ${absence.startDate} ~ ${absence.endDate} 수정`} onClick={() => editAbsence(absence)}>{absenceDisplayLabel(absence)} · 수정</button> : <span className={`day-status-chip ${absenceStatusClass(absence.type)}`}>{absenceDisplayLabel(absence)}</span>}
                                <small>{absence.startDate} ~ {absence.endDate}</small>
                              </span>
                            ))}
                            {memberAssignment ? <span className="day-status-chip overtime">잔업</span> : null}
                            {memberAbsences.length > 0 && memberAssignment ? <span className="day-status-chip conflict">중복</span> : null}
                          </div>
                          {isCurrentMember && !memberAbsences.length ? (
                            <button
                              type="button"
                              onClick={() => memberAbsences[0] ? editAbsence(memberAbsences[0]) : openRegister("overtime")}
                            >
                              수정
                            </button>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {expandedPanel === null ? baySummary : null}
            {expandedPanel === "register" ? (
              <section className="day-workspace-panel">
                <div className="day-expand-head">
                  <strong>{editingAbsenceId ? "내 근태 수정" : "내 일정 등록"}</strong>
                  <span>{currentMember?.name ?? "사용자 미지정"}</span>
                </div>
                {hasOvertime ? (
                  <div className="day-register-tabs" role="tablist" aria-label="일정 유형">
                    <button type="button" role="tab" aria-selected={registerMode === "attendance"} className={registerMode === "attendance" ? "active" : ""} onClick={() => setRegisterMode("attendance")}>근태</button>
                    <button type="button" role="tab" aria-selected={registerMode === "overtime"} className={registerMode === "overtime" ? "active" : ""} onClick={() => setRegisterMode("overtime")}>잔업</button>
                  </div>
                ) : null}
                {registerMode === "attendance" ? (
                  <form onSubmit={submitAbsence}>
                    {editingAbsenceId && (() => { const original = absences.find(a => a.id === editingAbsenceId); const period = mergedAttendance(absences).find(a => a.sourceIds.includes(editingAbsenceId)); return original && period ? <div className="attendance-edit-scope"><div>막대 표시 기간: {period.startDate} ~ {period.endDate}</div><div>이번 수정 대상: {original.startDate} ~ {original.endDate}</div><small>{period.sourceIds.length}건의 등록 기록 중 선택한 1건만 저장·삭제됩니다.</small></div> : null; })()}
                    <div className="day-form-grid">
                      <label>
                        <span>시작일</span>
                        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                      </label>
                      <label>
                        <span>종료일</span>
                        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                      </label>
                    </div>
                    <label className="day-form-label">근태 유형</label>
                    <div className="day-form-pills">
                      {absenceTypes.map((item) => (
                        <button key={item} type="button" className={type === item ? "active" : ""} onClick={() => setType(item)}>
                          {absenceLabels[item]}
                        </button>
                      ))}
                    </div>
                    <label className="day-form-field">
                      <span>유형 직접 입력 (선택)</span>
                      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="예: 건강검진, 출장" />
                    </label>
                    {type === "flex" ? (
                      <label className="day-form-field">
                        <span>자출 시간</span>
                        <input type="time" value={flexTime} onChange={(event) => setFlexTime(event.target.value)} required />
                      </label>
                    ) : null}
                    <label className="day-form-field">
                      <span>메모 (선택)</span>
                      <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="메모 입력" />
                    </label>
                    <div className="day-form-actions">
                      {editingAbsenceId ? <button type="button" className="day-danger-button" onClick={deleteEditingAbsence}>삭제</button> : null}
                      <button type="submit" className="day-submit">{editingAbsenceId ? "근태 저장" : "근태 등록"}</button>
                    </div>
                  </form>
                ) : (
                  <div className="day-overtime-form">
                    <label className="day-form-field">
                      <span>날짜</span>
                      <div>{date} {weekdayLabel}요일</div>
                    </label>
                    {currentAssignment ? (
                      <>
                        <p>현재 이 날짜에 잔업이 등록되어 있습니다.</p>
                        <button type="button" className="danger-submit" onClick={() => {
                          if (onDeleteAssignment(currentAssignment.id)) setExpandedPanel(null);
                        }}>잔업 해제</button>
                      </>
                    ) : (
                      <button type="button" className="day-submit" disabled={!currentMember} onClick={() => {
                        if (currentMember && onAddAssignment(currentMember.id)) setExpandedPanel(null);
                      }}>잔업 등록</button>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {expandedPanel === "history" ? (
              <section className="day-workspace-panel">
                <div className="day-expand-head">
                  <strong>변경 이력</strong>
                  <span>최근 {history.length}건</span>
                </div>
                {history.length === 0 ? <p className="day-detail-empty">이 날짜의 변경 이력이 없습니다.</p> : (
                  <ul className="day-history-list">
                    {history.map((log) => (
                      <li key={log.id}>
                        <time>{new Date(log.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                        <strong>{log.action}</strong>
                        <span>{log.actor}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </aside>

          <section className="day-detail-right">
            <div className="day-detail-section-head">
              <h3>이번 주 {hasOvertime ? "근무·잔업" : "근무"} 현황</h3>
              <span>{week[0].iso.slice(5).replace("-", ".")}–{week[4].iso.slice(5).replace("-", ".")} · 전체 팀원</span>
            </div>
            {weekMembers.length === 0 ? (
              <p className="day-detail-empty week-empty">이번 주에 등록된 {hasOvertime ? "근태·잔업" : "근태"} 일정이 없습니다.</p>
            ) : (
              <div className="day-week-scroll">
                <div className="day-week-matrix">
                  <div className="day-week-cell name header">사용자</div>
                  {week.map((day) => (
                    <div key={day.iso} className={["day-week-cell", "header", day.iso === date ? "selected" : ""].join(" ")}>
                      {weekDays[day.weekday]} {day.day}
                    </div>
                  ))}
                  {weekMembers.map((member) => (
                    <div className="day-week-row" key={member.id}>
                      <div className={["day-week-cell", "name", member.id === currentMember?.id ? "current-user" : ""].join(" ")}>
                        <i style={{ backgroundColor: member.color }} aria-hidden="true" />
                        {member.name}{member.id === currentMember?.id ? " · 나" : ""}
                      </div>
                      {week.map((day) => {
                        const memberAbsences = absences.filter((absence) => absence.memberId === member.id && overlapsDate(absence, day.iso));
                        const memberAssignment = hasOvertime && assignments.some((assignment) => assignment.memberId === member.id && assignment.date === day.iso);
                        const overlapping = memberAbsences.length > 0 && memberAssignment;
                        return (
                          <div key={day.iso} className={["day-week-cell", day.iso === date ? "selected" : "", member.id === currentMember?.id ? "current-user" : ""].join(" ")}>
                            {overlapping ? (
                              <span className="day-week-badge conflict">{absenceDisplayLabel(memberAbsences[0])}·잔업</span>
                            ) : (
                              <>
                                {memberAbsences.map((absence) => (
                                  <span key={absence.id} className={`day-week-badge ${absenceStatusClass(absence.type)}`}>{absenceDisplayLabel(absence)}</span>
                                ))}
                                {memberAssignment ? <span className="day-week-badge overtime">잔업</span> : null}
                                {memberAbsences.length === 0 && !memberAssignment ? <span className="day-week-normal">근무</span> : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="day-week-legend">
              {hasOvertime ? <span><i className="overtime" />잔업</span> : null}
              <span><i className="annual" />연차·패밀리데이</span>
              <span><i className="training" />교육</span>
              {hasOvertime && <span><i className="conflict" />중복 상태</span>}
            </div>
          </section>
        </div>}
      </div>
    </div>
  );
}

function CountPanel({ members, assignments, monthPrefix }: { members: Member[]; assignments: OvertimeAssignment[]; monthPrefix: string }) {
  const [tab, setTab] = useState<"month" | "total">("month");
  const rows = members
    .map((member) => {
      const count = assignments.filter((item) => item.memberId === member.id && (tab === "total" || item.date.startsWith(monthPrefix))).length;
      return { ...member, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <aside className="count-aside">
      <div className="panel count-panel">
        <div className="count-head">
          <div>
            <h2>잔업 횟수</h2>
            <p>{tab === "month" ? "이번 달" : "누적"} 총 {total}회</p>
          </div>
          <div className="count-tabs">
            <button type="button" className={tab === "month" ? "active" : ""} onClick={() => setTab("month")}>
              이번 달
            </button>
            <button type="button" className={tab === "total" ? "active" : ""} onClick={() => setTab("total")}>
              누적
            </button>
          </div>
        </div>
        {rows.every((row) => row.count === 0) ? (
          <p className="empty-state">데이터가 없습니다.</p>
        ) : (
          <ul className="count-list">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className={row.count === 0 ? "dimmed" : ""}
                style={{ "--member-color": row.color } as CSSProperties}
              >
                <div>
                  <span className="rank-badge">
                    {index + 1}
                  </span>
                  <strong>{row.name}</strong>
                  {index === 0 && row.count > 0 ? <span className="top-count-label">최다</span> : null}
                  <b>{row.count}회</b>
                </div>
                <em style={{ width: `${(row.count / max) * 100}%` }} />
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          <span aria-hidden="true">💡</span>
          <span>횟수가 적은 흐린 인원에게 다음 잔업을 배정하면 공평합니다.</span>
        </p>
      </div>
    </aside>
  );
}

export default function Section2Page() {
  const data = useAppData("calendar");
  const [surface, setSurface] = useState<"calendar" | "bay">("calendar");
  const [bayDate, setBayDate] = useState(todayIsoKst);
  const [commonOpen, setCommonOpen] = useState(false);
  const [commonIntent, setCommonIntent] = useState("");
  const [commonEndDate, setCommonEndDate] = useState<string | undefined>();
  const [currentTodayIso, setCurrentTodayIso] = useState("");
  const initialToday = isoParts(todayIsoKst());
  const [year, setYear] = useState(initialToday.year);
  const [month, setMonth] = useState(initialToday.month);
  const [viewMode, setViewMode] = useState<ViewMode>(appHasOvertime ? "both" : "attendance");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [weekStart, setWeekStart] = useState(startOfWeekIso(todayIsoKst()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [absenceDate, setAbsenceDate] = useState<string | null>(null);
  const [absenceEndDate, setAbsenceEndDate] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const suppressSelectionRef = useRef(false);
  const days = useMemo(() => buildCalendar(year, month, currentTodayIso), [year, month, currentTodayIso]);
  const memberWeekDays = useMemo(() => buildWeek(weekStart, currentTodayIso), [weekStart, currentTodayIso]);
  const membersById = useMemo(() => new Map(data.members.map((member) => [member.id, member])), [data.members]);
  const activeMembers = data.members.filter((member) => member.active && !reservedMemberNames.includes(member.name));
  const currentMember = activeMembers.find((member) => member.name === data.actor);
  const bayStore = useBay(appHasBay && !!currentMember);
  const commonStore = useCommonEvents(appHasCommonEvents && !!currentMember);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const weekAnchor = isoParts(addIsoDays(weekStart, 3));
  const weekNumber = Math.ceil((weekAnchor.day + weekdayFromIso(`${weekAnchor.year}-${String(weekAnchor.month + 1).padStart(2, "0")}-01`)) / 7);
  const selection = dragStart && dragEnd ? (dragStart <= dragEnd ? { start: dragStart, end: dragEnd } : { start: dragEnd, end: dragStart }) : null;

  useEffect(() => {
    if (!appHasOvertime && viewMode !== "attendance") {
      setViewMode("attendance");
    }
  }, [viewMode]);

  useEffect(() => {
    function refreshToday() {
      const nextToday = todayIsoKst();
      if (nextToday === currentTodayIso) return;

      const next = isoParts(nextToday);
      setCurrentTodayIso(nextToday);

      if (!currentTodayIso) {
        setYear(next.year);
        setMonth(next.month);
        return;
      }

      const previous = isoParts(currentTodayIso);
      if (year === previous.year && month === previous.month) {
        setYear(next.year);
        setMonth(next.month);
      }
    }

    refreshToday();
    const timeout = window.setTimeout(refreshToday, millisecondsUntilNextKstDate() + 1000);
    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshToday);
    window.addEventListener("pageshow", refreshToday);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshToday);
      window.removeEventListener("pageshow", refreshToday);
    };
  }, [currentTodayIso, year, month]);

  function cancelCalendarGesture() {
    suppressSelectionRef.current = true;
    setDragStart(null);
    setDragEnd(null);
  }

  function clearCalendarState() {
    setCommonEndDate(undefined);
    suppressSelectionRef.current = true;
    setSelectedDate(null);
    setAbsenceDate(null);
    setAbsenceEndDate(null);
    setRange(null);
    setDragStart(null);
    setDragEnd(null);
  }

  function changeCalendarView(nextView: CalendarView) {
    clearCalendarState();
    if (nextView === "members") {
      const firstOfMonth = `${monthPrefix}-01`;
      const focusDate = currentTodayIso.startsWith(monthPrefix) ? currentTodayIso : firstOfMonth;
      setWeekStart(startOfWeekIso(focusDate));
    }
    setCalendarView(nextView);
  }

  function moveWeek(amount: number) {
    const nextWeekStart = addIsoDays(weekStart, amount * 7);
    const anchor = isoParts(addIsoDays(nextWeekStart, 3));
    clearCalendarState();
    setWeekStart(nextWeekStart);
    setYear(anchor.year);
    setMonth(anchor.month);
  }

  function finishSelection(target?: EventTarget | null) {
    if (target instanceof Element && !target.closest(".date-grid")) {
        cancelCalendarGesture();
        return;
    }
    if (suppressSelectionRef.current) {
        setDragStart(null);
        setDragEnd(null);
        return;
    }
    if (!selection) return;
    if (selection.start === selection.end) {
        setSelectedDate(selection.start);
    } else {
        setRange(selection);
    }
    setDragStart(null);
    setDragEnd(null);
  }

  useEffect(() => {
    if (!selection) return;
    window.addEventListener("pointerup", finishDrag, true);
    return () => window.removeEventListener("pointerup", finishDrag, true);
    function finishDrag(event: PointerEvent) {
      finishSelection(event.target);
    }
  }, [selection]);

  useEffect(() => {
    window.addEventListener("pointerdown", cancelOutsideCalendar, true);
    return () => window.removeEventListener("pointerdown", cancelOutsideCalendar, true);
    function cancelOutsideCalendar(event: PointerEvent) {
      if (!dragStart && !dragEnd) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".date-grid") || target.closest(".modal-backdrop")) return;
      cancelCalendarGesture();
    }
  }, [dragStart, dragEnd]);

  useEffect(() => {
    window.addEventListener("pagehide", clearCalendarState);
    window.addEventListener("pageshow", clearCalendarState);
    return () => {
      window.removeEventListener("pagehide", clearCalendarState);
      window.removeEventListener("pageshow", clearCalendarState);
    };
  }, []);

  function goPrev() {
    if (calendarView === "members") {
      moveWeek(-1);
      return;
    }
    clearCalendarState();
    month === 0 ? (setYear((value) => value - 1), setMonth(11)) : setMonth((value) => value - 1);
  }

  function goNext() {
    if (calendarView === "members") {
      moveWeek(1);
      return;
    }
    clearCalendarState();
    month === 11 ? (setYear((value) => value + 1), setMonth(0)) : setMonth((value) => value + 1);
  }

  function goToday() {
    const todayIso = todayIsoKst();
    const today = isoParts(todayIso);
    setCurrentTodayIso(todayIso);
    setYear(today.year);
    setMonth(today.month);
    setWeekStart(startOfWeekIso(todayIso));
    clearCalendarState();
  }

  function exportMonthlyCsv() {
    const rows = [
      ["구분", "날짜", "팀원", "내용", "메모"],
      ...data.absences
        .filter((absence) => absence.startDate <= `${monthPrefix}-31` && absence.endDate >= `${monthPrefix}-01`)
        .map((absence) => {
          const member = membersById.get(absence.memberId);
          return [
            "부재",
            `${absence.startDate}~${absence.endDate}`,
            member?.name ?? "알 수 없음",
            absenceDisplayLabel(absence),
            absence.memo,
          ];
        }),
      ...(appHasOvertime
        ? data.assignments
            .filter((assignment) => assignment.date.startsWith(monthPrefix))
            .map((assignment) => {
              const member = membersById.get(assignment.memberId);
              return [
                "잔업",
                assignment.date,
                member?.name ?? "알 수 없음",
                overtimeMethodLabel(assignment.method),
                "",
              ];
            })
        : []),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${appTitle}-${monthPrefix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header
        viewMode={viewMode}
        onViewModeChange={(nextMode) => {
          clearCalendarState();
          setViewMode(nextMode);
        }}
        onNavigateAway={clearCalendarState}
        hasOvertime={appHasOvertime && surface === "calendar"}
      />
      <WorkerGate members={data.members} actor={data.actor} onSelect={data.setActor} />
      <main className="page-shell">
        <StatusControls
          actor={data.actor}
          onActorChange={data.setActor}
          saveStatus={data.saveStatus}
          lastSavedAt={data.lastSavedAt}
        />
        <CharacterReaction
          memberId={currentMember?.id}
          profile={currentMember ? data.characterProfiles.find((item) => item.memberId === currentMember.id) ?? defaultProfile(currentMember.id) : undefined}
          compact
          reactionOnly
        />
        {appHasBay && <div className="calendar-view-switch bay-page-switch" role="tablist" aria-label="일정 및 Bay 배정">
          <button type="button" role="tab" aria-selected={surface === "calendar"} className={surface === "calendar" ? "active" : ""} onClick={() => { clearCalendarState(); setSurface("calendar"); }}>일정</button>
          <button type="button" role="tab" aria-selected={surface === "bay"} className={surface === "bay" ? "active" : ""} onClick={() => { clearCalendarState(); setSurface("bay"); }}>Bay 배정</button>
        </div>}
        {appHasBay && surface === "bay" ? <BayWorkspace store={bayStore} members={activeMembers} absences={data.absences} actorId={currentMember?.id} date={bayDate} onDateChange={setBayDate} /> : <div className="dashboard-grid">
          <section className="calendar-section">
            <div className="panel calendar-panel">
              <div className="calendar-head">
                <div className="calendar-title-area">
                  <h2>
                    {calendarView === "month" ? year : weekAnchor.year}
                    <span>·</span>
                    <strong>{calendarView === "month" ? `${month + 1}월` : `${weekAnchor.month + 1}월 ${weekNumber}주차`}</strong>
                  </h2>
                  <div className="calendar-view-switch" role="tablist" aria-label="캘린더 표시 방식">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={calendarView === "month"}
                      className={calendarView === "month" ? "active" : ""}
                      onClick={() => changeCalendarView("month")}
                    >
                      월간 캘린더
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={calendarView === "members"}
                      className={calendarView === "members" ? "active" : ""}
                      onClick={() => changeCalendarView("members")}
                    >
                      팀원 현황
                    </button>
                  </div>
                </div>
                <div className="calendar-actions">
                  {appHasCommonEvents && <button type="button" className="primary-button small" disabled={!currentMember || !commonStore.loaded} onClick={() => { clearCalendarState(); setCommonIntent("new"); setCommonOpen(true); setSelectedDate(monthPrefix === todayIsoKst().slice(0, 7) ? todayIsoKst() : `${monthPrefix}-01`); }}>+ 공통 일정</button>}
                  <button type="button" className="secondary-button small" onClick={exportMonthlyCsv}>
                    CSV 내보내기
                  </button>
                  <div className="month-controls">
                    <button type="button" aria-label={calendarView === "month" ? "이전 달" : "이전 주"} onClick={goPrev}>
                      ‹
                    </button>
                    <button type="button" className="today-button" onClick={goToday}>
                      오늘
                    </button>
                    <button type="button" aria-label={calendarView === "month" ? "다음 달" : "다음 주"} onClick={goNext}>
                      ›
                    </button>
                  </div>
                </div>
              </div>
              <p className="drag-help">
                {calendarView === "month"
                  ? `날짜를 클릭하면 ${appHasOvertime ? "부재와 잔업을" : "부재를"} 등록할 수 있어요.`
                  : "사용자별 근태 유형을 주간 단위로 확인할 수 있어요."}
                {(calendarView === "month" ? year === 2028 : memberWeekDays.some(day => day.iso.startsWith("2028-"))) &&
                  " 2028년 공휴일은 잠정 일정입니다."}
              </p>
              {appHasCommonEvents && commonStore.error && <p className="common-error" role="alert">{commonStore.error} <button type="button" onClick={() => void commonStore.refresh()}>다시 불러오기</button></p>}
              {calendarView === "month" ? (
                <div className="calendar-scroll">
                  <div className="calendar-width">
                    <div className="weekday-grid">
                      {weekDays.map((day, index) => (
                        <div key={day} className={index === 0 ? "danger" : index === 6 ? "section-theme" : ""}>
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="date-grid continuous-month">
                      {Array.from({ length: days.length / 7 }, (_, weekIndex) => {
                        const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
                        const layout = attendanceLanes(viewMode === "overtime" ? [] : data.absences.filter(a => membersById.has(a.memberId)), week.map(d => d.iso));
                        return <div className="continuous-week" key={week[0].iso} style={{ gridTemplateRows: `52px ${layout.count ? `repeat(${layout.count}, minmax(32px, auto))` : ""} auto minmax(24px, auto)` }}>
                        {week.map((day, column) => (
                        <CalendarCell
                          key={day.iso}
                          laneCount={layout.count}
                          column={column}
                          day={day}
                          viewMode={viewMode}
                          membersById={membersById}
                          absences={data.absences.filter((absence) => overlapsDate(absence, day.iso))}
                          assignments={data.assignments.filter((item) => item.date === day.iso)}
                          hasOvertime={appHasOvertime}
                          selecting={!!selection && day.iso >= selection.start && day.iso <= selection.end}
                          onSelect={(date) => { setCommonOpen(false); setCommonIntent(""); setSelectedDate(date); }}
                          onPointerDown={(date) => {
                            suppressSelectionRef.current = false;
                            setDragStart(date);
                            setDragEnd(date);
                          }}
                          onPointerEnter={(date) => {
                            if (dragStart) setDragEnd(date);
                          }}
                          onPointerUp={finishSelection}
                        />
                      ))}
                      {week.map((day, column) => appHasCommonEvents && <div key={day.iso} className={`continuous-common-events ${day.inMonth ? "" : "outside"}`} style={{ gridColumn: column + 1, gridRow: layout.count + 2 }}><EventBadges events={commonStore.events.filter(e => eventOccursOn(e, day.iso))} onCancelGesture={clearCalendarState} onOpen={id => { clearCalendarState(); setCommonOpen(true); setCommonIntent(id); setSelectedDate(day.iso); }} /></div>)}
                      {layout.segments.map(({ absence, start, end, lane }) => <div key={`${absence.id}-${start}`} className="continuous-absence" style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: lane + 2, "--person": membersById.get(absence.memberId)?.color || "#687183", "--month-from": `${100 * week.slice(start, end + 1).filter(d => !d.inMonth && d.iso < `${year}-${String(month + 1).padStart(2, "0")}-01`).length / (end - start + 1)}%`, "--month-to": `${100 * (end - start + 1 - week.slice(start, end + 1).filter(d => !d.inMonth && d.iso > `${year}-${String(month + 1).padStart(2, "0")}-01`).length) / (end - start + 1)}%` } as CSSProperties}>
                        <span className="continuous-name">{membersById.get(absence.memberId)?.name}</span><span className="continuous-type">{absenceDisplayLabel(absence)}</span>
                      </div>)}
                      </div>;
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                {appHasCommonEvents && <div className="common-week-events">{commonStore.events.filter(e => !e.cancelled && (e.endDate ?? e.date) >= memberWeekDays[0].iso && e.date <= memberWeekDays[6].iso).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map(e => <button type="button" key={e.id} onClick={() => { clearCalendarState(); setCommonIntent(e.id); setCommonOpen(true); setSelectedDate(e.date); }}><small>{eventDateLabel(e)} {e.allDay ? "전일" : e.start}</small><strong>{e.title}</strong></button>)}</div>}
                <MemberWeekView
                  days={memberWeekDays}
                  members={activeMembers}
                  absences={data.absences}
                  assignments={data.assignments}
                  viewMode={viewMode}
                  hasOvertime={appHasOvertime}
                  onSelect={(date) => { setCommonOpen(false); setCommonIntent(""); setSelectedDate(date); }}
                />
                </>
              )}
            </div>
            <section className="panel dashboard-comments-panel">
              <div className="dashboard-comments-head">
                <h2>댓글</h2>
                <span>{appHasOvertime ? "근태·잔업" : "근태"} 관련 의견을 남길 수 있어요.</span>
              </div>
              <CommentThread
                comments={data.dashboardComments}
                emptyText="등록된 댓글이 없습니다."
                onComment={data.addDashboardComment}
                onReply={data.addDashboardReply}
                onUpdateComment={data.updateDashboardComment}
                onDeleteComment={data.deleteDashboardComment}
                onUpdateReply={data.updateDashboardReply}
                onDeleteReply={data.deleteDashboardReply}
              />
            </section>
          </section>
          {appHasOvertime ? <CountPanel members={activeMembers} assignments={data.assignments} monthPrefix={monthPrefix} /> : null}
        </div>}
      </main>
      {selectedDate ? (
        <DateModal
          key={selectedDate}
          date={selectedDate}
          hasOvertime={appHasOvertime}
          members={activeMembers}
          absences={data.absences}
          assignments={data.assignments}
          auditLogs={data.auditLogs}
          currentMember={currentMember}
          common={appHasCommonEvents ? { store: commonStore, open: commonOpen, intent: commonIntent, endDate: commonEndDate, onToggle: (open) => { setCommonIntent(""); setCommonOpen(open); }, onSaved: (date, id) => { setCommonIntent(id); setSelectedDate(date); } } : undefined}
          baySummary={appHasBay && bayStore.loaded ? <BayDaySummary schedules={bayStore.schedules} members={activeMembers} absences={data.absences} date={selectedDate} onOpen={() => { setBayDate(selectedDate); clearCalendarState(); setSurface("bay"); }} /> : undefined}
          onClose={() => setSelectedDate(null)}
          onAddAbsence={data.addAbsence}
          onUpdateAbsence={data.updateAbsence}
          onDeleteAbsence={data.deleteAbsence}
          onAddAssignment={(memberId) => data.addOvertime(memberId, [selectedDate])}
          onDeleteAssignment={data.deleteAssignment}
        />
      ) : null}
      {range ? (
        <RangeModal
          start={range.start}
          end={range.end}
          member={currentMember}
          hasOvertime={appHasOvertime}
          onClose={() => setRange(null)}
          onRegisterCommon={appHasCommonEvents ? () => {
            const selected = range;
            clearCalendarState();
            setCommonEndDate(selected.end);
            setCommonIntent("new");
            setCommonOpen(true);
            setSelectedDate(selected.start);
          } : undefined}
          onRegisterAbsence={() => {
            setAbsenceDate(range.start);
            setAbsenceEndDate(range.end);
            setRange(null);
          }}
          onRegisterOvertime={(memberId, dates) => data.addOvertime(memberId, dates)}
        />
      ) : null}
      <AbsenceModal
        open={!!absenceDate}
        members={activeMembers}
        registrationMember={currentMember}
        defaultDate={absenceDate ?? todayIsoKst()}
        defaultEndDate={absenceEndDate ?? undefined}
        onClose={() => {
          setAbsenceDate(null);
          setAbsenceEndDate(null);
        }}
        onSave={data.addAbsence}
      />
    </>
  );
}
