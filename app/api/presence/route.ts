import { NextResponse } from "next/server";
import { getServerSiteConfig } from "../../site-config";

export const dynamic = "force-dynamic";

const { presenceKey: stateKey } = getServerSiteConfig();
const ttlMs = 75_000;

type PresenceSession = {
  id: string;
  actor: string;
  path: string;
  lastSeen: string;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

function cleanSessions(value: unknown) {
  const now = Date.now();
  const sessions = Array.isArray(value) ? value : [];
  return sessions.filter((session): session is PresenceSession => {
    if (!session || typeof session !== "object") return false;
    const candidate = session as Partial<PresenceSession>;
    if (!candidate.id || !candidate.lastSeen) return false;
    const seenAt = new Date(candidate.lastSeen).getTime();
    return Number.isFinite(seenAt) && now - seenAt <= ttlMs;
  });
}

async function readPresence() {
  const response = await supabaseFetch(`app_state?key=eq.${stateKey}&select=value`);
  if (!response) return null;
  if (!response.ok) return { error: await response.text(), status: response.status } as const;
  const rows = (await response.json()) as { value: unknown }[];
  return cleanSessions(rows[0]?.value);
}

function unavailable() {
  return NextResponse.json(
    { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" },
    { status: 503 },
  );
}

export async function GET() {
  const sessions = await readPresence();
  if (!sessions) return unavailable();
  if ("error" in sessions) return NextResponse.json({ error: sessions.error }, { status: sessions.status });
  return NextResponse.json({ count: sessions.length });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<PresenceSession>;
  const sessionId = typeof body.id === "string" && body.id ? body.id : null;
  if (!sessionId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const sessions = await readPresence();
  if (!sessions) return unavailable();
  if ("error" in sessions) return NextResponse.json({ error: sessions.error }, { status: sessions.status });

  const now = new Date().toISOString();
  const next = [
    ...sessions.filter((session) => session.id !== sessionId),
    {
      id: sessionId,
      actor: typeof body.actor === "string" && body.actor ? body.actor : "미지정",
      path: typeof body.path === "string" ? body.path : "",
      lastSeen: now,
    },
  ];

  const response = await supabaseFetch("app_state?on_conflict=key", {
    method: "POST",
    body: JSON.stringify({
      key: stateKey,
      value: next,
      updated_at: now,
    }),
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
  });
  if (!response) return unavailable();
  if (!response.ok) return NextResponse.json({ error: await response.text() }, { status: response.status });

  return NextResponse.json({ count: next.length });
}
