import { isAllowedRequestOrigin } from "../../lib/request-origin";
import { NextResponse } from "next/server";
import { readCurrentState, isStoreFailure } from "../../lib/record-state";
import { listDrawingVoteResults, drawingVoteSummary, saveDrawingVote, settleDrawingVotes } from "../../lib/drawing-votes";
import { koreanDateKey } from "../../lounge/drawingChallenges";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "no-store"}});
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const force = params.get("settle") === "1";
    const source = request.headers.get("user-agent")?.startsWith("vercel-cron/") ? "scheduled" : "manual";
    const loadData = async () => {
      const state = await readCurrentState();
      if (!state || isStoreFailure(state)) throw new Error("Unavailable");
      return state.data;
    };
    if (params.get("view") === "history") {
      const offset = Number(params.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Invalid offset" }, 400);
      const data = await loadData();
      await settleDrawingVotes(() => data, force, source);
      return json(await listDrawingVoteResults(data, offset));
    }
    await settleDrawingVotes(loadData, force, source);
    return json(await drawingVoteSummary(koreanDateKey(), (params.get("memberId") ?? "").slice(0,200)));
  } catch { return json({error: "투표 정보를 불러오지 못했습니다."},503); }
}
export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) return json({error:"Invalid origin"},403);
  let body;
  try {
    const text = await request.text();
    if (text.length > 2000) return json({error:"Invalid request"},400);
    body = JSON.parse(text);
    if (typeof body.voterId !== "string" || typeof body.targetId !== "string" || body.voterId.length > 200 || body.targetId.length > 200 || body.date !== koreanDateKey()) return json({error:"오늘의 투표만 가능합니다."},400);
  } catch { return json({error:"Invalid request"},400); }
  try {
    const state = await readCurrentState();
    if (!state || isStoreFailure(state)) return json({error:"투표 저장 서버에 연결하지 못했습니다."},503);
    await saveDrawingVote(state.data, body.voterId, body.targetId, body.date);
    return json(await drawingVoteSummary(body.date, body.voterId));
  } catch (error) {
    const message=error instanceof Error?error.message:"";
    const business=["사용자를 다시 선택해주세요.","오늘 제출한 그림만 선택할 수 있습니다.","투표가 마감되었습니다.","자신의 그림에는 투표할 수 없습니다.","투표 저장이 겹쳤습니다. 다시 시도해주세요."].includes(message);
    return json({error:business?message:"투표 저장 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."},business?409:503);
  }
}
