import { NextResponse } from "next/server";
import { sendTelegramReport, type ReportKind } from "../../lib/telegram";

export const dynamic = "force-dynamic";

const allowedCategories = new Set(["오류", "사용 불편", "개선 요청", "서버 불러오기 실패", "저장 충돌", "저장 실패"]);
const rateLimitMs = 20_000;
const recentUserReports = new Map<string, number>();

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return !host || new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (cleanText(body.website, 100)) {
    return NextResponse.json({ ok: true });
  }

  const kind: ReportKind = body.kind === "automatic" ? "automatic" : "user";
  const category = cleanText(body.category, 40);
  const message = cleanText(body.message, 1000);
  const actor = cleanText(body.actor, 40) || "미지정";
  const path = cleanText(body.path, 160) || "/";
  if (!allowedCategories.has(category) || message.length < 2) {
    return NextResponse.json({ error: "invalid report" }, { status: 400 });
  }

  const incidentId = `INC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  console.info(
    "[report] received",
    JSON.stringify({ incidentId, kind, category, actor, path }),
  );

  let reporterKey: string | null = null;
  if (kind === "user") {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    reporterKey = forwardedFor || actor;
    const now = Date.now();
    const lastReportedAt = recentUserReports.get(reporterKey) ?? 0;
    if (now - lastReportedAt < rateLimitMs) {
      return NextResponse.json({ error: "too many reports" }, { status: 429 });
    }
    recentUserReports.set(reporterKey, now);
  }

  const result = await sendTelegramReport({
    incidentId,
    kind,
    category,
    message,
    actor,
    path,
    userAgent: cleanText(request.headers.get("user-agent"), 200),
  });
  if (!result.ok) {
    if (reporterKey) recentUserReports.delete(reporterKey);
    const status = result.reason === "not_configured" ? 503 : 502;
    console.error("[report] delivery failed", JSON.stringify({ incidentId, reason: result.reason }));
    return NextResponse.json({ error: result.reason }, { status });
  }

  console.info(
    "[report] delivered",
    JSON.stringify({ incidentId, deduplicated: result.deduplicated }),
  );
  return NextResponse.json({ ok: true, incidentId, deduplicated: result.deduplicated });
}
