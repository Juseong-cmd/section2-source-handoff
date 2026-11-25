import { isAllowedRequestOrigin } from "../../lib/request-origin";
import { NextResponse } from "next/server";
import { EventFailure, parseEventCommand, saveEvent } from "../../common-events/model";
import { reservedMemberNames, type AppData } from "../../data";
import { applyRecordChanges, createStateBackup, isStoreFailure, readCurrentState } from "../../lib/record-state";
import { getServerSiteConfig } from "../../site-config";
import type { RecordOperation } from "../../state-operations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const snapshot = (data: AppData) => ({ events: data.commonEvents, responses: data.commonResponses });
const enabled = () => ["section2", "process"].includes(getServerSiteConfig().slug);

export async function GET() {
  if (!enabled()) return json({ error: "Not found" }, 404);
  try {
    const state = await readCurrentState({ collections: ["commonEvents", "commonResponses"] });
    if (!state || isStoreFailure(state)) return json({ error: "공통 일정을 불러오지 못했습니다." }, 503);
    return json(snapshot(state.data));
  } catch { return json({ error: "서버 연결 실패" }, 503); }
}

export async function POST(request: Request) {
  if (!enabled()) return json({ error: "Not found" }, 404);
  if (!isAllowedRequestOrigin(request)) return json({ error: "Invalid origin" }, 403);
  const command = parseEventCommand(await request.json().catch(() => null));
  if (!command) return json({ error: "제목·대상자·날짜 기간·시각을 확인해주세요. 종료일은 시작일 이후 또는 같은 날, 종료 시각은 시작 시각 이후여야 합니다." }, 400);
  if (command.kind === "respond") return json({ error: "공통 일정 응답 기능이 종료되었습니다. 새로고침해주세요." }, 410);
  try {
    const state = await readCurrentState();
    if (!state || isStoreFailure(state)) return json({ error: "서버 연결 실패. 입력 내용은 유지됩니다." }, 503);
    const members = state.data.members.filter(m => !reservedMemberNames.includes(m.name));
    const actor = members.find(m => m.id === command.actorId && m.active);
    if (!actor) return json({ error: "사용자를 다시 선택해주세요." }, 403);
    const event = state.data.commonEvents.find(e => e.id === command.eventId) ?? null;
    let operation: RecordOperation;
    try {
        const after = saveEvent(event, command, members, actor, new Date().toISOString());
        if (after === event) return json(snapshot(state.data));
        operation = { collection: "commonEvents", id: command.eventId, before: event, after };
    } catch (e) { if (e instanceof EventFailure) return json({ error: e.message, ...snapshot(state.data) }, e.status); throw e; }
    const backup = await createStateBackup(state.data, state.updatedAt, "before-common-event-write");
    if (isStoreFailure(backup)) return json({ error: "백업 생성에 실패하여 저장하지 않았습니다. 다시 시도해주세요." }, 503);
    const saved = await applyRecordChanges([operation], command.requestId);
    if (!saved || isStoreFailure(saved)) return json({ error: "저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해주세요." }, 503);
    if ("conflict" in saved) {
      const latest = await readCurrentState();
      return json({ error: "동시에 변경된 내용이 있습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.", ...(latest && !isStoreFailure(latest) ? snapshot(latest.data) : {}) }, 409);
    }
    return json(snapshot(saved.data));
  } catch { return json({ error: "서버 연결이 끊겼습니다. 입력은 유지됩니다. 다시 저장해주세요." }, 503); }
}
