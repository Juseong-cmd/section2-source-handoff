import "server-only";

import { getServerSiteConfig } from "../site-config";

export type ReportKind = "user" | "automatic";

export type TelegramReport = {
  incidentId: string;
  kind: ReportKind;
  category: string;
  message: string;
  actor: string;
  path: string;
  userAgent?: string;
};

const automaticAlertWindowMs = 5 * 60 * 1000;
const recentAutomaticAlerts = new Map<string, number>();

function siteLabel() {
  return getServerSiteConfig().slug === "process" ? "PROCESS" : "SECTION2";
}

function formatKst(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function shouldSkipDuplicate(report: TelegramReport) {
  if (report.kind !== "automatic") return false;
  const now = Date.now();
  const key = `${siteLabel()}:${report.category}:${report.path}`;
  const lastSentAt = recentAutomaticAlerts.get(key) ?? 0;
  if (now - lastSentAt < automaticAlertWindowMs) return true;

  recentAutomaticAlerts.set(key, now);
  for (const [storedKey, sentAt] of Array.from(recentAutomaticAlerts.entries())) {
    if (now - sentAt >= automaticAlertWindowMs) recentAutomaticAlerts.delete(storedKey);
  }
  return false;
}

export async function sendTelegramReport(report: TelegramReport) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false as const, reason: "not_configured" as const };
  }
  if (shouldSkipDuplicate(report)) {
    return { ok: true as const, deduplicated: true };
  }

  const heading = report.kind === "automatic" ? "치명적 오류 알림" : "사용자 문제 제보";
  const text = [
    `[${siteLabel()}] ${heading}`,
    `알림 ID: ${report.incidentId}`,
    `유형: ${report.category}`,
    `사용자: ${report.actor || "미지정"}`,
    `화면: ${report.path || "/"}`,
    `시각: ${formatKst(new Date())}`,
    "",
    report.message,
    "",
    ...(report.userAgent ? [`기기: ${report.userAgent}`] : []),
    ...(process.env.APP_PUBLIC_ORIGIN ? [`사이트: ${process.env.APP_PUBLIC_ORIGIN}`] : []),
  ].join("\n");

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[telegram] send failed (${response.status})`);
      return { ok: false as const, reason: "send_failed" as const };
    }
    return { ok: true as const, deduplicated: false };
  } catch (error) {
    console.error("[telegram] send failed", error);
    return { ok: false as const, reason: "send_failed" as const };
  }
}
