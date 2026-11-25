"use client";

import { startVisiblePolling } from "./visible-polling";
import { useEffect, useState } from "react";
import { appReportingEnabled, appStoragePrefix } from "./site-config";
import { reservedMemberNames, type AuditLog, type Member, type SaveStatus } from "./store";

const saveLabels: Record<SaveStatus, string> = {
  loading: "불러오는 중",
  local: "로컬 저장",
  idle: "서버 연결",
  saving: "저장 중",
  retrying: "재시도 중",
  saved: "저장됨",
  error: "저장 실패",
  conflict: "동시 수정 감지",
};
const presenceStorageKey = `${appStoragePrefix}-presence-id-v1`;
const heartbeatStorageKey = `${appStoragePrefix}-presence-heartbeat`;
const heartbeatIntervalMs = 30_000;

type SharedHeartbeat = { at: number; count: number };

function readSharedHeartbeat(): SharedHeartbeat | null {
  try {
    const raw = window.localStorage.getItem(heartbeatStorageKey);
    return raw ? JSON.parse(raw) as SharedHeartbeat : null;
  } catch {
    return null;
  }
}

function formatSavedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function createPresenceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `presence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPresenceId() {
  if (typeof window === "undefined") return createPresenceId();
  const saved = window.localStorage.getItem(presenceStorageKey);
  if (saved) return saved;
  const next = createPresenceId();
  window.localStorage.setItem(presenceStorageKey, next);
  return next;
}

function usePresence(actor: string) {
  const [count, setCount] = useState<number | null>(null);
  const [sessionId] = useState(getPresenceId);

  useEffect(() => {
    let cancelled = false;

    function syncCount() {
      const stored = readSharedHeartbeat();
      if (!cancelled && stored && Date.now() - stored.at < 75_000) setCount(stored.count);
    }

    async function heartbeat() {
      if (cancelled || document.hidden) return;
      const stored = readSharedHeartbeat();
      if (stored && Date.now() - stored.at < heartbeatIntervalMs - 2000) {
        syncCount();
        return;
      }
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: sessionId,
            actor,
            path: window.location.pathname,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && typeof payload.count === "number") {
          if (!cancelled) setCount(payload.count);
          try {
            window.localStorage.setItem(heartbeatStorageKey, JSON.stringify({ at: Date.now(), count: payload.count }));
          } catch {
            // The current tab still works if storage is unavailable.
          }
        }
      } catch {
        if (!cancelled) setCount(null);
      }
    }

    function poll() {
      if (!navigator.locks) {
        void heartbeat();
        return;
      }
      void navigator.locks.request(heartbeatStorageKey, heartbeat)
        .catch(() => { void heartbeat(); });
    }

    function onStorage(event: StorageEvent) {
      if (event.key === heartbeatStorageKey) syncCount();
    }

    window.addEventListener("storage", onStorage);
    const stop = startVisiblePolling(poll, heartbeatIntervalMs);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("storage", onStorage);
    };
  }, [actor, sessionId]);

  return count;
}

export function StatusControls({
  actor,
  onActorChange,
  saveStatus,
  lastSavedAt,
}: {
  actor: string;
  onActorChange: (actor: string) => void;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
}) {
  const presenceCount = usePresence(actor);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("오류");
  const [reportMessage, setReportMessage] = useState("");
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function closeReport() {
    setReportOpen(false);
    setReportCategory("오류");
    setReportMessage("");
    setReportStatus("idle");
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = reportMessage.trim();
    if (message.length < 2 || reportStatus === "sending") return;
    setReportStatus("sending");

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "user",
          category: reportCategory,
          message,
          actor,
          path: window.location.pathname,
          website: "",
        }),
      });
      if (!response.ok) throw new Error("report failed");
      setReportStatus("sent");
      setReportMessage("");
    } catch {
      setReportStatus("error");
    }
  }

  return (
    <>
      <div className="status-controls">
        {appReportingEnabled ? (
          <button type="button" className="issue-report-trigger" onClick={() => setReportOpen(true)}>
            문제 제보
          </button>
        ) : null}
        <div className="worker-chip">
          <span>사용자</span>
          <strong>{actor}</strong>
          <button type="button" className="worker-change-button" onClick={() => onActorChange("미지정")}>
            변경
          </button>
        </div>
        <span className={`save-pill ${saveStatus}`}>
          {saveLabels[saveStatus]}
          {saveStatus === "saved" ? ` · ${formatSavedAt(lastSavedAt)}` : ""}
        </span>
        <span className="presence-pill">접속 {presenceCount ?? "-"}명</span>
      </div>
      {appReportingEnabled && reportOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeReport()}>
          <form className="modal-card issue-report-card" role="dialog" aria-modal="true" aria-labelledby="issue-report-title" onSubmit={submitReport}>
            <div className="modal-head">
              <h2 id="issue-report-title">문제 제보</h2>
              <button type="button" className="icon-close" aria-label="닫기" onClick={closeReport}>×</button>
            </div>
            <label className="field">
              <span>유형</span>
              <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} disabled={reportStatus === "sent"}>
                <option value="오류">오류</option>
                <option value="사용 불편">사용 불편</option>
                <option value="개선 요청">개선 요청</option>
              </select>
            </label>
            <label className="field">
              <span>문제 사항</span>
              <textarea
                value={reportMessage}
                onChange={(event) => {
                  setReportMessage(event.target.value);
                  if (reportStatus === "error") setReportStatus("idle");
                }}
                maxLength={1000}
                rows={5}
                placeholder="발생한 문제나 불편한 점을 간단히 적어주세요."
                disabled={reportStatus === "sent"}
                autoFocus
              />
              <small>{reportMessage.length}/1000</small>
            </label>
            <p className={`report-feedback ${reportStatus}`} aria-live="polite">
              {reportStatus === "sent" ? "제보가 전송되었습니다." : reportStatus === "error" ? "전송하지 못했습니다. 잠시 후 다시 시도해주세요." : ""}
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeReport}>닫기</button>
              {reportStatus !== "sent" ? (
                <button type="submit" className="primary-button" disabled={reportMessage.trim().length < 2 || reportStatus === "sending"}>
                  {reportStatus === "sending" ? "전송 중" : "보내기"}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function WorkerGate({
  members,
  actor,
  onSelect,
}: {
  members: Member[];
  actor: string;
  onSelect: (actor: string) => void;
}) {
  const activeMembers = members.filter((member) => member.active && !reservedMemberNames.includes(member.name));
  if (actor !== "미지정" || activeMembers.length === 0) return null;

  return (
    <div className="worker-gate" role="dialog" aria-modal="true">
      <section className="worker-gate-card">
        <div>
          <span className="section-theme-wordmark">SECTION2</span>
          <h1>사용자 선택</h1>
          <p>접속 전 본인 이름을 선택해 변경 이력과 댓글 작성자를 남깁니다.</p>
        </div>
        <div className="worker-list">
          {activeMembers.map((member) => (
            <button key={member.id} type="button" onClick={() => onSelect(member.name)}>
              <span style={{ backgroundColor: member.color }} />
              {member.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AuditPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="panel audit-panel">
      <div className="audit-head">
        <h2>변경 이력</h2>
        <span>최근 {Math.min(logs.length, 8)}건</span>
      </div>
      {logs.length === 0 ? (
        <p className="muted-text">아직 변경 이력이 없습니다.</p>
      ) : (
        <ul className="audit-list">
          {logs.slice(0, 8).map((log) => (
            <li key={log.id}>
              <strong>{log.action}</strong>
              <span>
                {log.actor} · {new Date(log.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
