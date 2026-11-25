import type { AppData } from "../data";
import type { DrawingSubmission } from "../lounge/types";
import { getServerSiteConfig } from "../site-config";

const prefix = `drawing-history:v1:${getServerSiteConfig().stateKey}:`;
export type DrawingHistoryEntry = DrawingSubmission & { memberName: string };
async function db(query: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("History unavailable");
  const response = await fetch(`${url}/rest/v1/app_state?${query}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000), headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error("History unavailable");
  return response;
}
const historyKey = (drawing: DrawingSubmission) => prefix + drawing.date + ":" + encodeURIComponent(drawing.memberId);

export async function archiveDrawing(drawing: DrawingSubmission | null, memberName: string) {
  if (!drawing) return;
  // First accepted submission wins. Retries and later days never overwrite history.
  await db("on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ key: historyKey(drawing), value: { ...drawing, memberName }, updated_at: drawing.createdAt }) });
}
export async function repairDrawingHistory(data: AppData) {
  if (!data.drawingSubmissions.length) return;
  for (let offset = 0; offset < data.drawingSubmissions.length; offset += 20) {
    const drawings = data.drawingSubmissions.slice(offset, offset + 20);
    const keys = drawings.map(drawing => JSON.stringify(historyKey(drawing))).join(",");
    const params = new URLSearchParams({ key: `in.(${keys})`, select: "key" });
    const response = await db(params.toString());
    const existing = new Set(((await response.json()) as {key: string}[]).map(row => row.key));
    for (const drawing of drawings) {
      if (!existing.has(historyKey(drawing))) {
        await archiveDrawing(drawing, data.members.find(member => member.id === drawing.memberId)?.name ?? "이전 사용자");
      }
    }
  }
}
export async function listDrawingHistory(memberId: string, offset: number) {
  const query = new URLSearchParams({key: `like.${prefix}%`, select: "value", order: "key.desc", limit: "7", offset: String(offset)});
  if (memberId) query.set("value->>memberId", `eq.${memberId}`);
  const response = await db(query.toString());
  const rows = await response.json() as { value: DrawingHistoryEntry }[];
  return { entries: rows.slice(0, 6).map(r => r.value), nextOffset: rows.length > 6 ? offset + 6 : null };
}

export async function drawingHistorySnapshot(date: string, memberId: string) {
  const response=await db(new URLSearchParams({key:`eq.${prefix}${date}:${encodeURIComponent(memberId)}`,select:"value"}).toString());
  return ((await response.json()) as {value:DrawingHistoryEntry}[])[0]?.value ?? null;
}
