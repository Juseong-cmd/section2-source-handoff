"use client";

import { useState } from "react";
import { appTitle } from "../site-config";
import { AuditPanel, StatusControls, WorkerGate } from "../status-controls";
import { FeedbackPost, useAppData } from "../store";

function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-row">
          <a className="brand" href="/" aria-label={appTitle}>
            <span className="section-theme-wordmark">SECTION2</span>
            <span className="brand-divider" />
            <span className="brand-label">{appTitle}</span>
          </a>
          <div className="desktop-mode" />
          <nav className="primary-nav" aria-label="주요 메뉴">
            <a href="/">캘린더</a>
            <a href="/lounge">라운지</a>
            <a className="active" href="/feedback">
              게시판
            </a>
            <a href="/admin">관리</a>
          </nav>
        </div>
      </div>
    </header>
  );
}

function formatDate(value: string, mode: "short" | "long" = "short") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (mode === "long") {
    return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\\. /g, ".").replace(/\.$/, "");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function groupUpdates(feedbacks: FeedbackPost[]) {
  return feedbacks.reduce<Array<{ date: string; items: FeedbackPost[] }>>((groups, feedback) => {
    const date = formatDate(feedback.createdAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) {
      last.items.push(feedback);
      return groups;
    }
    return [...groups, { date, items: [feedback] }];
  }, []);
}

function UpdateBody({ body }: { body: string }) {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="update-body">{body}</p>;
  }

  return (
    <ul className="update-body-list">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`}>{line.replace(/^[-*]\s*/, "")}</li>
      ))}
    </ul>
  );
}

function UpdateDayCard({
  group,
  defaultOpen = false,
}: {
  group: { date: string; items: FeedbackPost[] };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className={`update-card ${open ? "open" : ""}`}>
      <button type="button" className="update-toggle" onClick={() => setOpen((value) => !value)}>
        <span>
          최근 업데이트 {group.date}
        </span>
        <strong>{group.items.length}건</strong>
        <em>{open ? "접기" : "펼치기"}</em>
      </button>
      {open ? (
        <div className="update-content">
          <ul className="update-entry-list">
            {group.items.map((feedback) => (
              <li key={feedback.id} className="update-entry">
                <div className="update-meta">
                  <strong>{formatTime(feedback.createdAt)}</strong>
                  <span>{feedback.title}</span>
                </div>
                <UpdateBody body={feedback.body} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default function FeedbackPage() {
  const data = useAppData();
  const groups = groupUpdates(data.feedbacks);

  return (
    <>
      <Header />
      <WorkerGate members={data.members} actor={data.actor} onSelect={data.setActor} />
      <main className="narrow-shell">
        <h1 className="admin-title">업데이트 게시판</h1>
        <StatusControls
          actor={data.actor}
          onActorChange={data.setActor}
          saveStatus={data.saveStatus}
          lastSavedAt={data.lastSavedAt}
        />
        <section className="panel admin-panel update-composer-panel">
          {groups.length === 0 ? (
            <p className="muted-text">아직 업데이트 내역이 없습니다.</p>
          ) : (
            <div className="update-history">
              {groups.map((group, index) => (
                <UpdateDayCard
                  key={group.date}
                  group={group}
                  defaultOpen={index === 0}
                />
              ))}
            </div>
          )}
        </section>
        <AuditPanel logs={data.auditLogs} />
      </main>
    </>
  );
}
