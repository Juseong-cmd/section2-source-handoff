"use client";

import { useEffect, useRef, useState } from "react";
import { appHasOvertime, appReportingEnabled, appStoragePrefix } from "./site-config";
import { applyRecordOperations, buildRecordOperations, rebaseRecordOperations, containsRecordChanges } from "./state-operations";
import { todayIsoKst } from "./date-utils";
import { defaultProfile, emitCharacterReaction, notifyProfile } from "./lounge/service";
import type { CharacterId, DrawingSubmission, ExpActivity } from "./lounge/types";
import { grantExp, normalizeExpProfile, requestedExp } from "./lounge/utils/exp";
export {
  absenceColors,
  absenceLabels,
  initialData,
  reservedMemberNames,
  swatches,
  type Absence,
  type AbsenceType,
  type AppData,
  type AuditLog,
  type Equipment,
  type EquipmentBlock,
  type FeedbackComment,
  type FeedbackPost,
  type FeedbackReply,
  type Member,
  type OvertimeAssignment,
  type OvertimeLog,
  type OvertimeAvailability,
} from "./data";

import { initialData, reservedMemberNames, type Absence, type AppData, type EquipmentBlock, type FeedbackComment, type FeedbackPost, type FeedbackReply, type Member, type OvertimeLog as StoredOvertimeLog } from "./data";

export type SaveStatus = "loading" | "local" | "idle" | "saving" | "retrying" | "saved" | "error" | "conflict";

const storageKey = `${appStoragePrefix}-data-v1`;
const pendingSaveKey = `${appStoragePrefix}-pending-save-v2`;
const actorKey = `${appStoragePrefix}-actor-v1`;
const actorSelectedAtKey = `${appStoragePrefix}-actor-selected-at-v1`;
const actorSessionMs = 8 * 60 * 60 * 1000;
const loadRetryDelaysMs = [750, 2000];
const saveRetryDelaysMs = [1500, 3000, 6000, 12000, 24000];
const conflictMergeRetryDelaysMs = [120, 300, 700];
const maxNormalPendingOperations = 20;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isReservedMemberName(name: string) {
  return reservedMemberNames.includes(name.trim());
}

function isSelectableActor(name: string, members: Member[]) {
  return members.some((member) => member.active && member.name === name && !isReservedMemberName(member.name));
}

function normalizeReply(value: Partial<FeedbackReply>, fallbackId: string): FeedbackReply {
  return {
    id: value.id || fallbackId,
    author: value.author || "미지정",
    body: value.body || "",
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt,
  };
}

function normalizeComment(value: Partial<FeedbackComment>, fallbackId: string): FeedbackComment {
  return {
    id: value.id || fallbackId,
    author: value.author || "미지정",
    body: value.body || "",
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt,
    replies: (value.replies ?? []).map((reply, index) => normalizeReply(reply, `${fallbackId}-reply-${index}`)),
  };
}

function normalizeOvertimeLog(value: Partial<StoredOvertimeLog>, fallbackId: string): StoredOvertimeLog {
  return {
    id: value.id || fallbackId,
    date: value.date || "",
    memberId: value.memberId || "",
    memberName: value.memberName || "알 수 없음",
    action: value.action === "removed" ? "removed" : "assigned",
    method: value.method === "random" ? "random" : value.method === "self" ? "self" : "agree",
    actor: value.actor || "미지정",
    at: value.at || new Date().toISOString(),
  };
}

function normalizeAbsence(value: Partial<Absence>): Absence {
  const legacyType = String(value.type || "annual");
  const type: Absence["type"] =
    legacyType === "vacation" ? "annual" : legacyType === "out" ? "flex" : legacyType === "training" || legacyType === "flex" || legacyType === "family" || legacyType === "etc" ? legacyType : "annual";
  return {
    id: value.id || createId("abs"),
    memberId: value.memberId || "",
    startDate: value.startDate || "",
    endDate: value.endDate || value.startDate || "",
    type,
    label: value.label || "",
    memo: value.memo || "",
    flexTime: type === "flex" ? value.flexTime || "" : "",
  };
}

function normalizeFeedback(value: unknown, index: number): FeedbackPost {
  const feedback = (value && typeof value === "object" ? value : {}) as Partial<FeedbackPost> & {
    status?: string;
    response?: string;
  };
  const createdAt = feedback.createdAt || new Date().toISOString();
  const id = feedback.id || `update-${index}`;

  if (Array.isArray(feedback.comments)) {
    return {
      id,
      author: feedback.author || "미지정",
      title: feedback.title || "업데이트",
      body: feedback.body || "",
      comments: feedback.comments.map((comment, commentIndex) => normalizeComment(comment, `${id}-comment-${commentIndex}`)),
      createdAt,
      updatedAt: feedback.updatedAt || createdAt,
    };
  }

  const legacyBody = [feedback.title, feedback.body].filter(Boolean).join("\n");
  return {
    id,
    author: "관리자",
    title: "업데이트 내역",
    body: "기존 개선의견 게시판 내용을 댓글과 답글 형태로 이관했습니다.",
    comments: legacyBody
      ? [
          {
            id: `${id}-comment`,
            author: feedback.author || "미지정",
            body: legacyBody,
            createdAt,
            replies: feedback.response
              ? [
                  {
                    id: `${id}-reply`,
                    author: "관리자",
                    body: feedback.response,
                    createdAt: feedback.updatedAt || createdAt,
                  },
                ]
              : [],
          },
        ]
      : [],
    createdAt,
    updatedAt: feedback.updatedAt || createdAt,
  };
}

function normalizeData(value: unknown): AppData {
  const parsed = { ...initialData, ...(value && typeof value === "object" ? value : {}) } as AppData;
  return {
    ...parsed,
    baySchedules: parsed.baySchedules ?? [],
    commonEvents: parsed.commonEvents ?? [],
    commonResponses: parsed.commonResponses ?? [],
    members: parsed.members.map((member) => ({
      ...member,
      active: member.active ?? true,
    })),
    absences: (parsed.absences ?? []).map(normalizeAbsence),
    auditLogs: (parsed.auditLogs ?? []).slice(0, 80),
    feedbacks: (parsed.feedbacks ?? []).map(normalizeFeedback),
    dashboardComments: (parsed.dashboardComments ?? []).map((comment, index) => normalizeComment(comment, `dashboard-comment-${index}`)),
    overtimeLogs: (parsed.overtimeLogs ?? []).map((log, index) => normalizeOvertimeLog(log, `ot-log-${index}`)).slice(0, 160),
    characterProfiles: (parsed.characterProfiles ?? []).map(normalizeExpProfile),
    dailyCharacterExp: parsed.dailyCharacterExp ?? [],
    drawingSubmissions: parsed.drawingSubmissions ?? [],
  };
}

function awardCharacterExpInData(current: AppData, memberId: string, activity: ExpActivity, score?: number) {
  const profile = normalizeExpProfile(
    current.characterProfiles.find((item) => item.memberId === memberId) ?? defaultProfile(memberId),
  );
  const date = todayIsoKst();
  const dailyRecord = current.dailyCharacterExp.find((item) => item.memberId === memberId && item.date === date)
    ?? { memberId, date, amount: 0 };
  const result = grantExp(profile, dailyRecord, requestedExp(activity, score));

  return {
    result,
    data: {
      ...current,
      characterProfiles: [
        ...current.characterProfiles.filter((item) => item.memberId !== memberId),
        result.profile,
      ],
      dailyCharacterExp: [
        ...current.dailyCharacterExp.filter((item) => item.memberId !== memberId || item.date !== date),
        result.dailyRecord,
      ],
    },
  };
}

function addLog(data: AppData, actor: string, action: string): AppData {
  return {
    ...data,
    auditLogs: [
      { id: createId("log"), at: new Date().toISOString(), actor: actor || "미지정", action },
      ...(data.auditLogs ?? []),
    ].slice(0, 80),
  };
}

function readStoredData(): AppData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadData(): AppData {
  return readStoredData() ?? initialData;
}

type PendingSave = {
  data: AppData;
  baseData: AppData;
  updatedAt: string | null;
};

function readPendingSave(): PendingSave | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(pendingSaveKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<PendingSave>;
    if (!value.data || !value.baseData) return null;
    return {
      data: normalizeData(value.data),
      baseData: normalizeData(value.baseData),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function writePendingSave(data: AppData, baseData: AppData | null, updatedAt: string | null) {
  if (typeof window === "undefined" || !baseData) return;
  window.localStorage.setItem(pendingSaveKey, JSON.stringify({ data, baseData, updatedAt }));
}

function clearPendingSave() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(pendingSaveKey);
  window.localStorage.removeItem(storageKey);
}

function parseStateResponse(value: unknown): { data: AppData; updatedAt: string | null } {
  if (value && typeof value === "object" && "data" in value) {
    const envelope = value as { data?: unknown; updatedAt?: unknown };
    return {
      data: normalizeData(envelope.data),
      updatedAt: typeof envelope.updatedAt === "string" ? envelope.updatedAt : null,
    };
  }
  return { data: normalizeData(value), updatedAt: null };
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function loadServerData(calendarView = false) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= loadRetryDelaysMs.length; attempt += 1) {
    try {
      const response = await fetch(calendarView ? "/api/state?view=calendar" : "/api/state", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`server state unavailable (${response.status})`);
      }
      return parseStateResponse(await response.json());
    } catch (error) {
      lastError = error;
      const retryDelay = loadRetryDelaysMs[attempt];
      if (retryDelay === undefined) throw error;
      await wait(retryDelay);
    }
  }

  throw lastError;
}

async function saveServerData(data: AppData, updatedAt: string | null, baseData: AppData | null, requestId: string) {
  const operations = baseData ? buildRecordOperations(baseData, data) : null;
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
    body: JSON.stringify(operations
      ? { operations, requestId }
      : { data, updatedAt, requestId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const conflictDetail = payload.details ? `: ${payload.details.collection}/${payload.details.recordId} (${payload.details.reason}, 완료 ${payload.details.completedOperations}건)` : `: ${payload.error || "unknown"}`;
    const error = new Error(response.status === 409 ? `conflict (409)${conflictDetail}` : `server state save failed (${response.status})`);
    error.name = response.status === 409 ? "ConflictError" : "SaveError";
    throw error;
  }
  return parseStateResponse(payload);
}

function serverContainsPendingChanges(serverData: AppData, data: AppData, baseData: AppData | null) {
  return baseData !== null && containsRecordChanges(serverData, data, baseData);
}

function recoverLegacyPending(serverData: AppData, legacyData: AppData | null) {
  if (!legacyData) return null;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const serverLogIds = new Set((serverData.auditLogs ?? []).map((log) => log.id));
  const serverAbsenceIds = new Set(serverData.absences.map((item) => item.id));
  const serverAvailabilityIds = new Set(serverData.availability.map((item) => item.id));
  const serverAssignmentIds = new Set(serverData.assignments.map((item) => item.id));
  const memberIdByName = new Map(serverData.members.map((member) => [member.name, member.id]));
  const recoveredAbsences: AppData["absences"] = [];
  const recoveredAvailability: AppData["availability"] = [];
  const recoveredAssignments: AppData["assignments"] = [];
  const recoveredLogs: AppData["auditLogs"] = [];

  for (const log of legacyData.auditLogs ?? []) {
    if (serverLogIds.has(log.id) || new Date(log.at).getTime() < cutoff) continue;
    let recovered = false;
    const absenceMatch = log.action.match(/^부재 등록: (.+) (\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/);
    const availabilityMatch = log.action.match(/^잔업 가능 토글: (.+) (\d{4}-\d{2}-\d{2})$/);
    const assignmentMatch = log.action.match(/^(?:잔업 확정|잔업 등록): (.+) (\d{4}-\d{2}-\d{2})$/);

    if (absenceMatch) {
      const [, memberName, startDate, endDate] = absenceMatch;
      const memberId = memberIdByName.get(memberName);
      const item = legacyData.absences.find(
        (absence) =>
          absence.memberId === memberId &&
          absence.startDate === startDate &&
          absence.endDate === endDate &&
          !serverAbsenceIds.has(absence.id),
      );
      if (item) {
        recoveredAbsences.push(item);
        serverAbsenceIds.add(item.id);
        recovered = true;
      }
    } else if (availabilityMatch) {
      const [, memberName, date] = availabilityMatch;
      const memberId = memberIdByName.get(memberName);
      const item = legacyData.availability.find(
        (availability) => availability.memberId === memberId && availability.date === date && !serverAvailabilityIds.has(availability.id),
      );
      if (item) {
        recoveredAvailability.push(item);
        serverAvailabilityIds.add(item.id);
        recovered = true;
      }
    } else if (assignmentMatch) {
      const [, memberName, date] = assignmentMatch;
      const memberId = memberIdByName.get(memberName);
      const item = legacyData.assignments.find(
        (assignment) => assignment.memberId === memberId && assignment.date === date && !serverAssignmentIds.has(assignment.id),
      );
      if (item) {
        recoveredAssignments.push(item);
        serverAssignmentIds.add(item.id);
        recovered = true;
      }
    }

    if (recovered) recoveredLogs.push(log);
  }

  if (recoveredLogs.length === 0) return null;
  return {
    ...serverData,
    absences: [...serverData.absences, ...recoveredAbsences],
    availability: [...serverData.availability, ...recoveredAvailability],
    assignments: [...serverData.assignments, ...recoveredAssignments],
    auditLogs: [...recoveredLogs, ...(serverData.auditLogs ?? [])]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 80),
  };
}

async function reportClientIssue(category: "서버 불러오기 실패" | "저장 충돌" | "저장 실패", message: string, actor = "미지정") {
  if (!appReportingEnabled || typeof window === "undefined") return;
  await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "automatic",
      category,
      message,
      actor,
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

function confirmAction(message: string) {
  if (typeof window === "undefined") return true;
  return window.confirm(message);
}

function alertMessage(message: string) {
  if (typeof window === "undefined") return;
  window.alert(message);
}

function clearStoredActor() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(actorKey);
  window.sessionStorage.removeItem(actorSelectedAtKey);
  window.localStorage.removeItem(actorKey);
}

function readStoredActor() {
  if (typeof window === "undefined") return "미지정";
  window.localStorage.removeItem(actorKey);
  const saved = window.sessionStorage.getItem(actorKey);
  const selectedAt = Number(window.sessionStorage.getItem(actorSelectedAtKey) || "0");
  if (!saved || !selectedAt || Date.now() - selectedAt > actorSessionMs) {
    clearStoredActor();
    return "미지정";
  }
  return saved;
}

function writeStoredActor(actor: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(actorKey);
  if (actor === "미지정") {
    clearStoredActor();
    return;
  }
  window.sessionStorage.setItem(actorKey, actor);
  window.sessionStorage.setItem(actorSelectedAtKey, String(Date.now()));
}

export function useAppData(view: "calendar" | "full" = "full") {
  const [data, setData] = useState<AppData>(initialData);
  const [hydrated, setHydrated] = useState(false);
  const [serverBacked, setServerBacked] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [changeVersion, setChangeVersion] = useState(0);
  const savedVersionRef = useRef(0);
  const latestVersionRef = useRef(0);
  const latestDataRef = useRef<AppData>(initialData);
  const baseDataRef = useRef<AppData | null>(null);
  const serverUpdatedAtRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const retryAfterSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const reportedFailureVersionRef = useRef<number | null>(null);
  const saveOperationRef = useRef<{ version: number; id: string } | null>(null);
  const [actor, setActorState] = useState("미지정");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setActorState(readStoredActor());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || actor === "미지정") return;
    const timer = window.setInterval(() => {
      if (readStoredActor() === "미지정") {
        setActorState("미지정");
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [actor]);

  useEffect(() => {
    let cancelled = false;
    const calendarView = view === "calendar" && !readPendingSave() && !readStoredData();
    loadServerData(calendarView)
      .then(serverState => calendarView && (readPendingSave() || readStoredData()) ? loadServerData() : serverState)
      .then((serverState) => {
        if (cancelled) return;
        let pending = readPendingSave();
        if (!pending) {
          const recoveredData = recoverLegacyPending(serverState.data, readStoredData());
          if (recoveredData) {
            pending = { data: recoveredData, baseData: serverState.data, updatedAt: serverState.updatedAt };
            writePendingSave(pending.data, pending.baseData, pending.updatedAt);
            window.localStorage.removeItem(storageKey);
          }
        }
        if (pending && !serverContainsPendingChanges(serverState.data, pending.data, pending.baseData)) {
          const pendingOperations = buildRecordOperations(pending.baseData, pending.data);
          if (pendingOperations.length > maxNormalPendingOperations) {
            const recoveredData = recoverLegacyPending(serverState.data, pending.data);
            clearPendingSave();
            pending = recoveredData
              ? { data: recoveredData, baseData: serverState.data, updatedAt: serverState.updatedAt }
              : null;
          } else {
            try {
              pending = {
                data: rebaseRecordOperations(serverState.data, pendingOperations, true),
                baseData: serverState.data,
                updatedAt: serverState.updatedAt,
              };
            } catch {
              // Keep the original intent and base; the save path reports the conflict.
            }
            writePendingSave(pending.data, pending.baseData, pending.updatedAt);
          }
        }
        if (pending && !serverContainsPendingChanges(serverState.data, pending.data, pending.baseData)) {
          setData(pending.data);
          latestDataRef.current = pending.data;
          baseDataRef.current = pending.baseData;
          serverUpdatedAtRef.current = pending.updatedAt;
          setLastSavedAt(pending.updatedAt);
          setChangeVersion(1);
          setSaveStatus("retrying");
        } else {
          if (pending) clearPendingSave();
          setData(serverState.data);
          baseDataRef.current = serverState.data;
          serverUpdatedAtRef.current = serverState.updatedAt;
          setLastSavedAt(serverState.updatedAt);
          setSaveStatus("idle");
        }
        setServerBacked(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setData(loadData());
        setServerBacked(false);
        setSaveStatus("local");
        const detail = error instanceof Error ? error.message : "알 수 없는 오류";
        void reportClientIssue(
          "서버 불러오기 실패",
          `서버 상태 조회를 ${loadRetryDelaysMs.length + 1}회 시도했지만 실패해 로컬 저장 모드로 전환되었습니다. 마지막 오류: ${detail}`,
        );
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    latestVersionRef.current = changeVersion;
  }, [changeVersion]);

  useEffect(() => {
    if (!hydrated || actor === "미지정") return;
    if (!isSelectableActor(actor, data.members)) {
      setActor("미지정");
    }
  }, [actor, data.members, hydrated]);

  useEffect(() => {
    if (!hydrated || changeVersion === 0 || savedVersionRef.current === changeVersion) return;
    if (serverBacked) {
      writePendingSave(latestDataRef.current, baseDataRef.current, serverUpdatedAtRef.current);
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, 350);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [changeVersion, hydrated, serverBacked]);

  async function flushSave() {
    if (!hydrated) return;
    const version = latestVersionRef.current;
    if (version === 0 || savedVersionRef.current === version) return;

    if (!serverBacked) {
      window.localStorage.setItem(storageKey, JSON.stringify(latestDataRef.current));
      savedVersionRef.current = version;
      setSaveStatus("local");
      return;
    }

    if (savingRef.current) {
      retryAfterSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    retryAfterSaveRef.current = false;
    setSaveStatus("saving");
    let saved = false;
    if (saveOperationRef.current?.version !== version) {
      saveOperationRef.current = { version, id: createId("save") };
    }
    const requestId = saveOperationRef.current.id;
    const dataToSave = latestDataRef.current;
    const baseData = baseDataRef.current;
    const expectedUpdatedAt = serverUpdatedAtRef.current;
    const baseLogIds = new Set(baseData?.auditLogs.map(log => log.id) ?? []);
    const saveActor = dataToSave.auditLogs.find(log => !baseLogIds.has(log.id))?.actor || actor;

    function acceptServerState(serverState: Awaited<ReturnType<typeof saveServerData>>) {
      const laterOperations = buildRecordOperations(dataToSave, latestDataRef.current);
      const rebasedData = applyRecordOperations(serverState.data, laterOperations);
      serverUpdatedAtRef.current = serverState.updatedAt;
      baseDataRef.current = serverState.data;
      latestDataRef.current = rebasedData;
      setData(rebasedData);
      setLastSavedAt(serverState.updatedAt ?? new Date().toISOString());
      savedVersionRef.current = version;
      retryAttemptRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (version === latestVersionRef.current) {
        clearPendingSave();
      } else {
        writePendingSave(rebasedData, serverState.data, serverState.updatedAt);
      }
      setSaveStatus("saved");
      saved = true;
    }

    try {
      const serverState = await saveServerData(dataToSave, expectedUpdatedAt, baseData, requestId);
      acceptServerState(serverState);
    } catch (error) {
      writePendingSave(latestDataRef.current, baseDataRef.current, serverUpdatedAtRef.current);
      const conflict = error instanceof Error && error.name === "ConflictError";
      if (!conflict && retryAttemptRef.current < saveRetryDelaysMs.length && !retryTimerRef.current) {
        setSaveStatus("retrying");
        const delay = saveRetryDelaysMs[retryAttemptRef.current];
        retryAttemptRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void flushSave();
        }, delay);
      } else {
        const verifiedState = await loadServerData().catch(() => null);
        if (
          verifiedState &&
          serverContainsPendingChanges(verifiedState.data, dataToSave, baseData)
        ) {
          acceptServerState(verifiedState);
        } else if (conflict && verifiedState && baseData) {
          const pendingOperations = buildRecordOperations(baseData, dataToSave);
          let retryState = verifiedState;
          let retryError: unknown = error;
          for (const delay of conflictMergeRetryDelaysMs) {
            try {
              const rebasedPendingData = rebaseRecordOperations(retryState.data, pendingOperations, true);
              const retriedState = await saveServerData(
                rebasedPendingData,
                retryState.updatedAt,
                retryState.data,
                requestId,
              );
              acceptServerState(retriedState);
              break;
            } catch (nextError) {
              retryError = nextError;
              if (!(nextError instanceof Error) || nextError.name !== "ConflictError") break;
              await wait(delay);
              const latestState = await loadServerData().catch(() => null);
              if (!latestState) break;
              retryState = latestState;
            }
          }
          if (!saved) {
            const detail = retryError instanceof Error ? retryError.message : "알 수 없는 오류";
            setSaveStatus("conflict");
            if (reportedFailureVersionRef.current !== version) {
              reportedFailureVersionRef.current = version;
              void reportClientIssue(
                "저장 충돌",
                `동시 수정 자동 병합을 재시도했지만 저장하지 못했습니다. 저장 작업 ID: ${requestId}. 마지막 오류: ${detail}`,
                saveActor,
              );
            }
          }
        }
        if (!saved && !conflict) {
          setSaveStatus("error");
          if (reportedFailureVersionRef.current !== version) {
            reportedFailureVersionRef.current = version;
            const detail = error instanceof Error ? error.message : "알 수 없는 오류";
            void reportClientIssue(
              "저장 실패",
              `자동 재시도 ${saveRetryDelaysMs.length}회를 완료했고 서버 반영 여부도 확인했지만 저장되지 않았습니다. 저장 작업 ID: ${requestId}. 마지막 오류: ${detail}`,
              saveActor,
            );
          }
        } else if (!saved && conflict && (!verifiedState || !baseData)) {
          setSaveStatus("conflict");
          if (reportedFailureVersionRef.current !== version) {
            reportedFailureVersionRef.current = version;
            const detail = error instanceof Error ? error.message : "알 수 없는 오류";
            void reportClientIssue(
              "저장 충돌",
              `동시 수정 병합을 위한 최신 상태를 불러오지 못했습니다. 저장 작업 ID: ${requestId}. 마지막 오류: ${detail}`,
              saveActor,
            );
          }
        }
      }
    } finally {
      savingRef.current = false;
      if (saved && (retryAfterSaveRef.current || savedVersionRef.current !== latestVersionRef.current)) {
        retryAfterSaveRef.current = false;
        void flushSave();
      }
    }
  }

  useEffect(() => {
    if (!hydrated || !serverBacked || typeof window === "undefined") return;

    const retryPendingSave = () => {
      if (savedVersionRef.current === latestVersionRef.current) return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptRef.current = 0;
      void flushSave();
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retryPendingSave();
    };

    window.addEventListener("online", retryPendingSave);
    window.addEventListener("focus", retryPendingSave);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryPendingSave);
      window.removeEventListener("focus", retryPendingSave);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [hydrated, serverBacked]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  function setActor(nextActor: string) {
    const candidate = nextActor || "미지정";
    const normalized = candidate === "미지정" || isSelectableActor(candidate, latestDataRef.current.members)
      ? candidate
      : "미지정";
    setActorState(normalized);
    writeStoredActor(normalized);
  }

  function commit(action: string, updater: (current: AppData) => AppData) {
    setData((current) => {
      const next = addLog(updater(current), actor, action);
      latestDataRef.current = next;
      if (serverBacked) {
        writePendingSave(next, baseDataRef.current, serverUpdatedAtRef.current);
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
    setChangeVersion((value) => value + 1);
  }

  return {
    ...data,
    hydrated,
    serverBacked,
    saveStatus,
    lastSavedAt,
    actor,
    setActor,
    selectCharacter(memberId: string, characterId: CharacterId) {
      const currentProfile = normalizeExpProfile(
        data.characterProfiles.find((item) => item.memberId === memberId) ?? defaultProfile(memberId),
      );
      const nextProfile = { ...currentProfile, characterId };
      commit("캐릭터 변경", (current) => {
        const latestProfile = normalizeExpProfile(
          current.characterProfiles.find((item) => item.memberId === memberId) ?? defaultProfile(memberId),
        );
        return {
          ...current,
          characterProfiles: [
            ...current.characterProfiles.filter((item) => item.memberId !== memberId),
            { ...latestProfile, characterId },
          ],
        };
      });
      notifyProfile(nextProfile);
    },
    initializeCharacterProfile(profile: ReturnType<typeof defaultProfile>) {
      if (data.characterProfiles.some((item) => item.memberId === profile.memberId)) return;
      const normalized = normalizeExpProfile(profile);
      commit("캐릭터 정보 이전", (current) => current.characterProfiles.some((item) => item.memberId === profile.memberId)
        ? current
        : { ...current, characterProfiles: [...current.characterProfiles, normalized] });
    },
    awardCharacterExp(memberId: string, activity: ExpActivity, score?: number) {
      const preview = awardCharacterExpInData(data, memberId, activity, score);
      commit("캐릭터 EXP 획득", (current) => awardCharacterExpInData(current, memberId, activity, score).data);
      notifyProfile(preview.result.profile, preview.result.granted);
      return preview.result;
    },
    submitDrawing(memberId: string, date: string, challengeId: string, imageDataUrl: string, score: number, grading?: import("./lounge/drawingGrade").DrawingGrade) {
      if (data.drawingSubmissions.some((item) => item.memberId === memberId && item.date === date)) {
        return { accepted: false, granted: 0 };
      }
      const preview = awardCharacterExpInData(data, memberId, "drawing", score);
      const submission: DrawingSubmission = {
        id: `drawing-${memberId}-${date}`,
        memberId,
        date,
        challengeId,
        imageDataUrl,
        score,
        ...(grading ? { grading } : {}),
        createdAt: new Date().toISOString(),
      };
      commit("드로잉 제출", (current) => {
        if (current.drawingSubmissions.some((item) => item.memberId === memberId && item.date === date)) return current;
        const awarded = awardCharacterExpInData(current, memberId, "drawing", score).data;
        return {
          ...awarded,
          drawingSubmissions: [
            ...awarded.drawingSubmissions.filter((item) => item.memberId !== memberId),
            submission,
          ],
        };
      });
      notifyProfile(preview.result.profile, preview.result.granted);
      return { accepted: true, granted: preview.result.granted };
    },
    addFeedback(title: string, body: string) {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      if (!trimmedTitle || !trimmedBody) return;
      const now = new Date().toISOString();
      const feedback: FeedbackPost = {
        id: createId("fb"),
        author: actor,
        title: trimmedTitle,
        body: trimmedBody,
        comments: [],
        createdAt: now,
        updatedAt: now,
      };
      commit(`업데이트 등록: ${trimmedTitle}`, (current) => ({
        ...current,
        feedbacks: [feedback, ...(current.feedbacks ?? [])],
      }));
    },
    updateFeedback(id: string, updates: Partial<Pick<FeedbackPost, "title" | "body">>) {
      const target = data.feedbacks.find((feedback) => feedback.id === id);
      commit(`업데이트 수정: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.map((feedback) =>
          feedback.id === id ? { ...feedback, ...updates, updatedAt: new Date().toISOString() } : feedback,
        ),
      }));
    },
    deleteFeedback(id: string) {
      const target = data.feedbacks.find((feedback) => feedback.id === id);
      if (!confirmAction(`"${target?.title ?? "이 업데이트"}"를 삭제할까요? 댓글과 답글도 함께 삭제됩니다.`)) return false;
      commit(`업데이트 삭제: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.filter((feedback) => feedback.id !== id),
      }));
      return true;
    },
    addFeedbackComment(feedbackId: string, body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      const target = data.feedbacks.find((feedback) => feedback.id === feedbackId);
      const now = new Date().toISOString();
      const comment: FeedbackComment = {
        id: createId("comment"),
        author: actor,
        body: trimmedBody,
        createdAt: now,
        replies: [],
      };
      commit(`댓글 등록: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.map((feedback) =>
          feedback.id === feedbackId
            ? { ...feedback, comments: [...feedback.comments, comment], updatedAt: now }
            : feedback,
        ),
      }));
    },
    deleteFeedbackComment(feedbackId: string, commentId: string) {
      if (!confirmAction("이 댓글을 삭제할까요? 답글도 함께 삭제됩니다.")) return false;
      const target = data.feedbacks.find((feedback) => feedback.id === feedbackId);
      commit(`댓글 삭제: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.map((feedback) =>
          feedback.id === feedbackId
            ? {
                ...feedback,
                comments: feedback.comments.filter((comment) => comment.id !== commentId),
                updatedAt: new Date().toISOString(),
              }
            : feedback,
        ),
      }));
      return true;
    },
    addFeedbackReply(feedbackId: string, commentId: string, body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      const target = data.feedbacks.find((feedback) => feedback.id === feedbackId);
      const now = new Date().toISOString();
      const reply: FeedbackReply = {
        id: createId("reply"),
        author: actor,
        body: trimmedBody,
        createdAt: now,
      };
      commit(`답글 등록: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.map((feedback) =>
          feedback.id === feedbackId
            ? {
                ...feedback,
                comments: feedback.comments.map((comment) =>
                  comment.id === commentId ? { ...comment, replies: [...comment.replies, reply] } : comment,
                ),
                updatedAt: now,
              }
            : feedback,
        ),
      }));
    },
    deleteFeedbackReply(feedbackId: string, commentId: string, replyId: string) {
      if (!confirmAction("이 답글을 삭제할까요?")) return false;
      const target = data.feedbacks.find((feedback) => feedback.id === feedbackId);
      commit(`답글 삭제: ${target?.title ?? "알 수 없음"}`, (current) => ({
        ...current,
        feedbacks: current.feedbacks.map((feedback) =>
          feedback.id === feedbackId
            ? {
                ...feedback,
                comments: feedback.comments.map((comment) =>
                  comment.id === commentId
                    ? { ...comment, replies: comment.replies.filter((reply) => reply.id !== replyId) }
                    : comment,
                ),
                updatedAt: new Date().toISOString(),
              }
            : feedback,
        ),
      }));
      return true;
    },
    addDashboardComment(body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      const now = new Date().toISOString();
      const comment: FeedbackComment = {
        id: createId("dashboard-comment"),
        author: actor,
        body: trimmedBody,
        createdAt: now,
        replies: [],
      };
      commit("댓글 등록", (current) => ({
        ...current,
        dashboardComments: [...(current.dashboardComments ?? []), comment],
      }));
    },
    deleteDashboardComment(commentId: string) {
      if (!confirmAction("이 댓글을 삭제할까요? 답글도 함께 삭제됩니다.")) return false;
      commit("댓글 삭제", (current) => ({
        ...current,
        dashboardComments: (current.dashboardComments ?? []).filter((comment) => comment.id !== commentId),
      }));
      return true;
    },
    updateDashboardComment(commentId: string, body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      commit("댓글 수정", (current) => ({
        ...current,
        dashboardComments: (current.dashboardComments ?? []).map((comment) =>
          comment.id === commentId ? { ...comment, body: trimmedBody, updatedAt: new Date().toISOString() } : comment,
        ),
      }));
    },
    addDashboardReply(commentId: string, body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      const reply: FeedbackReply = {
        id: createId("dashboard-reply"),
        author: actor,
        body: trimmedBody,
        createdAt: new Date().toISOString(),
      };
      commit("댓글 답글 등록", (current) => ({
        ...current,
        dashboardComments: (current.dashboardComments ?? []).map((comment) =>
          comment.id === commentId ? { ...comment, replies: [...comment.replies, reply] } : comment,
        ),
      }));
    },
    updateDashboardReply(commentId: string, replyId: string, body: string) {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      commit("댓글 답글 수정", (current) => ({
        ...current,
        dashboardComments: (current.dashboardComments ?? []).map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                replies: comment.replies.map((reply) =>
                  reply.id === replyId ? { ...reply, body: trimmedBody, updatedAt: new Date().toISOString() } : reply,
                ),
              }
            : comment,
        ),
      }));
    },
    deleteDashboardReply(commentId: string, replyId: string) {
      if (!confirmAction("이 답글을 삭제할까요?")) return false;
      commit("댓글 답글 삭제", (current) => ({
        ...current,
        dashboardComments: (current.dashboardComments ?? []).map((comment) =>
          comment.id === commentId
            ? { ...comment, replies: comment.replies.filter((reply) => reply.id !== replyId) }
            : comment,
        ),
      }));
      return true;
    },
    addMember(name: string, color: string) {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (isReservedMemberName(trimmed)) {
        alertMessage(`${trimmed}은 팀원 이름으로 사용할 수 없습니다.`);
        return;
      }
      commit(`팀원 추가: ${trimmed}`, (current) => ({
        ...current,
        members: [...current.members, { id: createId("m"), name: trimmed, color, active: true }],
      }));
    },
    updateMember(id: string, updates: Partial<Pick<Member, "color" | "active">>) {
      const target = data.members.find((member) => member.id === id);
      commit(`팀원 수정: ${target?.name ?? "알 수 없음"}`, (current) => ({
        ...current,
        members: current.members.map((member) =>
          member.id === id ? { ...member, ...updates } : member,
        ),
      }));
    },
    deleteMember(id: string) {
      const target = data.members.find((member) => member.id === id);
      const relatedText = appHasOvertime ? "관련 부재와 잔업 기록" : "관련 부재 기록";
      if (!confirmAction(`${target?.name ?? "이 팀원"}을 삭제할까요? ${relatedText}도 함께 삭제됩니다.`)) return false;
      commit(`팀원 삭제: ${target?.name ?? "알 수 없음"}`, (current) => ({
        ...current,
        members: current.members.filter((member) => member.id !== id),
        absences: current.absences.filter((absence) => absence.memberId !== id),
        availability: current.availability.filter((item) => item.memberId !== id),
        assignments: current.assignments.filter((assignment) => assignment.memberId !== id),
        characterProfiles: current.characterProfiles.filter((profile) => profile.memberId !== id),
        dailyCharacterExp: current.dailyCharacterExp.filter((record) => record.memberId !== id),
        equipmentBlocks: current.equipmentBlocks.map((block) =>
          block.reporterId === id ? { ...block, reporterId: null } : block,
        ),
      }));
      return true;
    },
    addEquipment(name: string, category: string) {
      const trimmed = name.trim();
      if (!trimmed) return;
      commit(`설비 추가: ${trimmed}`, (current) => ({
        ...current,
        equipments: [
          ...current.equipments,
          { id: createId("eq"), name: trimmed, category: category.trim() },
        ],
      }));
    },
    deleteEquipment(id: string) {
      const target = data.equipments.find((equipment) => equipment.id === id);
      if (!confirmAction(`${target?.name ?? "이 설비"}를 삭제할까요? 관련 사용 불가 일정도 함께 삭제됩니다.`)) return false;
      commit(`설비 삭제: ${target?.name ?? "알 수 없음"}`, (current) => ({
        ...current,
        equipments: current.equipments.filter((equipment) => equipment.id !== id),
        equipmentBlocks: current.equipmentBlocks.filter((block) => block.equipmentId !== id),
      }));
      return true;
    },
    addAbsence(absence: Omit<Absence, "id">) {
      const member = data.members.find((item) => item.active && item.name === actor && !isReservedMemberName(item.name));
      if (!member) {
        alertMessage("사용자를 먼저 선택해주세요.");
        return;
      }
      const ownedAbsence = { ...absence, memberId: member.id };
      commit(`부재 등록: ${member.name} ${absence.startDate}~${absence.endDate}`, (current) => awardCharacterExpInData({
        ...current,
        absences: [...current.absences, { ...ownedAbsence, id: createId("abs") }],
      }, member.id, "attendance").data);
      const overlapsAssignment = data.assignments.some((item) => (
        item.memberId === member.id && absence.startDate <= item.date && item.date <= absence.endDate
      ));
      emitCharacterReaction(overlapsAssignment ? "overlap" : absence.type === "annual" ? "annual" : "schedule");
    },
    updateAbsence(id: string, updates: Omit<Absence, "id">) {
      const target = data.absences.find((absence) => absence.id === id);
      const member = data.members.find((item) => item.active && item.name === actor && !isReservedMemberName(item.name));
      if (!target || !member) {
        alertMessage("사용자를 먼저 선택해주세요.");
        return false;
      }
      if (target.memberId !== member.id) {
        alertMessage("본인의 근태만 수정할 수 있습니다.");
        return false;
      }
      const ownedUpdates = { ...updates, memberId: member.id };
      commit(`부재 수정: ${member.name} ${updates.startDate}~${updates.endDate}`, (current) => ({
        ...current,
        absences: current.absences.map((absence) =>
          absence.id === id ? { ...absence, ...ownedUpdates } : absence,
        ),
      }));
      return true;
    },
    deleteAbsence(id: string) {
      const target = data.absences.find((absence) => absence.id === id);
      const member = data.members.find((item) => item.active && item.name === actor && !isReservedMemberName(item.name));
      if (!target || !member) {
        alertMessage("사용자를 먼저 선택해주세요.");
        return false;
      }
      if (target.memberId !== member.id) {
        alertMessage("본인의 근태만 삭제할 수 있습니다.");
        return false;
      }
      if (!confirmAction("이 부재를 삭제할까요?")) return false;
      commit(`부재 삭제: ${member.name} ${target.startDate}~${target.endDate}`, (current) => ({
        ...current,
        absences: current.absences.filter((absence) => absence.id !== id),
      }));
      return true;
    },
    addOvertime(_memberId: string, dates: string[]) {
      const member = data.members.find((item) => item.active && item.name === actor && !isReservedMemberName(item.name));
      if (!member) {
        alertMessage("사용자를 먼저 선택해주세요.");
        return false;
      }
      const memberId = member.id;
      const uniqueDates = Array.from(new Set(dates.filter(Boolean))).sort();
      const newDates = uniqueDates.filter(
        (date) => !data.assignments.some((item) => item.memberId === memberId && item.date === date),
      );
      if (newDates.length === 0) {
        alertMessage("선택한 날짜의 잔업이 이미 등록되어 있습니다.");
        return false;
      }
      const dateLabel = newDates.length === 1
        ? newDates[0]
        : `${newDates[0]}~${newDates[newDates.length - 1]} (${newDates.length}일)`;

      commit(`잔업 등록: ${member.name} ${dateLabel}`, (current) => {
        const pendingDates = newDates.filter(
          (date) => !current.assignments.some((item) => item.memberId === memberId && item.date === date),
        );
        if (pendingDates.length === 0) return current;
        const pendingDateSet = new Set(pendingDates);
        const at = new Date().toISOString();
        const assignments = pendingDates.map((date) => ({
          id: `as-${memberId}-${date}`,
          memberId,
          date,
          method: "self" as const,
        }));
        const logs: StoredOvertimeLog[] = pendingDates.map((date) => ({
          id: createId("ot-log"),
          date,
          memberId,
          memberName: member.name,
          action: "assigned",
          method: "self",
          actor,
          at,
        }));

        return awardCharacterExpInData({
          ...current,
          availability: current.availability.filter(
            (item) => item.memberId !== memberId || !pendingDateSet.has(item.date),
          ),
          assignments: [...current.assignments, ...assignments],
          overtimeLogs: [...logs, ...(current.overtimeLogs ?? [])].slice(0, 160),
        }, member.id, "schedule").data;
      });
      const overlapsAbsence = data.absences.some((absence) => (
        absence.memberId === member.id && newDates.some((date) => absence.startDate <= date && date <= absence.endDate)
      ));
      emitCharacterReaction(overlapsAbsence ? "overlap" : "overtime");
      return true;
    },
    deleteAssignment(id: string) {
      const target = data.assignments.find((assignment) => assignment.id === id);
      if (!target) return false;
      const actingMember = data.members.find((item) => item.active && item.name === actor && !isReservedMemberName(item.name));
      if (!actingMember) {
        alertMessage("사용자를 먼저 선택해주세요.");
        return false;
      }
      if (target.memberId !== actingMember.id) {
        alertMessage("본인의 잔업만 해제할 수 있습니다.");
        return false;
      }
      if (!confirmAction("이 잔업 등록을 해제할까요?")) return false;
      const member = data.members.find((item) => item.id === target.memberId);
      const action = `잔업 해제: ${member?.name ?? "알 수 없음"} ${target.date}`;
      const log: StoredOvertimeLog = {
        id: createId("ot-log"),
        date: target.date,
        memberId: target.memberId,
        memberName: member?.name ?? "알 수 없음",
        action: "removed",
        method: target.method,
        actor,
        at: new Date().toISOString(),
      };
      commit(action, (current) => ({
        ...current,
        assignments: current.assignments.filter((assignment) => assignment.id !== id),
        availability: current.availability.filter(
          (item) => !(item.memberId === target.memberId && item.date === target.date),
        ),
        overtimeLogs: [log, ...(current.overtimeLogs ?? [])].slice(0, 160),
      }));
      return true;
    },
    addEquipmentBlock(block: Omit<EquipmentBlock, "id">) {
      const equipment = data.equipments.find((item) => item.id === block.equipmentId);
      commit(`설비 불가 등록: ${equipment?.name ?? "알 수 없음"} ${block.startDate}~${block.endDate}`, (current) => ({
        ...current,
        equipmentBlocks: [...current.equipmentBlocks, { ...block, id: createId("block") }],
      }));
    },
    updateEquipmentBlock(id: string, updates: Omit<EquipmentBlock, "id">) {
      const equipment = data.equipments.find((item) => item.id === updates.equipmentId);
      commit(`설비 불가 수정: ${equipment?.name ?? "알 수 없음"} ${updates.startDate}~${updates.endDate}`, (current) => ({
        ...current,
        equipmentBlocks: current.equipmentBlocks.map((block) =>
          block.id === id ? { ...block, ...updates } : block,
        ),
      }));
    },
    deleteEquipmentBlock(id: string) {
      if (!confirmAction("이 설비 사용 불가 일정을 삭제할까요?")) return false;
      commit("설비 불가 삭제", (current) => ({
        ...current,
        equipmentBlocks: current.equipmentBlocks.filter((block) => block.id !== id),
      }));
      return true;
    },
  };
}
