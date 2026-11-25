import { isAllowedRequestOrigin } from "../../lib/request-origin";
import { NextResponse } from "next/server";
import { applyBayCommand, emptySchedule, parseBayCommand } from "../../bay/model";
import { reservedMemberNames } from "../../data";
import { applyRecordChanges, createStateBackup, isStoreFailure, readCurrentState } from "../../lib/record-state";
import { getServerSiteConfig } from "../../site-config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const enabled = () => getServerSiteConfig().slug === "section2";

export async function GET() {
  if (!enabled()) return json({ error: "Not found" }, 404);
  try {
    const state = await readCurrentState({ collections: ["baySchedules"] });
    if (!state || isStoreFailure(state)) return json({ error: "Bay 배정을 불러오지 못했습니다. 다시 시도해주세요." }, 503);
    return json({ schedules: state.data.baySchedules });
  } catch { return json({ error: "Bay 서버 연결 실패" }, 503); }
}

export async function POST(request: Request) {
  if (!enabled()) return json({ error: "Not found" }, 404);
  if (!isAllowedRequestOrigin(request)) return json({ error: "Invalid origin" }, 403);
  const command = parseBayCommand(await request.json().catch(() => null));
  if (!command) return json({ error: "담당자, Bay, 기간, 변경 사유를 확인해주세요." }, 400);
  try {
    const state = await readCurrentState();
    if (!state || isStoreFailure(state)) return json({ error: "서버 연결 실패. 입력 내용은 유지됩니다." }, 503);
    const active = state.data.members.filter(m => m.active && !reservedMemberNames.includes(m.name));
    const actor = active.find(m => m.id === command.actorId);
    const member = active.find(m => m.id === command.memberId);
    if (!actor || !member) return json({ error: "활성 사용자와 담당자를 다시 선택해주세요." }, 400);
    const before = state.data.baySchedules.find(s => s.id === member.id) ?? null;
    if (before?.history.some(h => h.id === command.requestId)) return json({ schedule: before });
    if ((before?.revision ?? 0) !== command.revision) return json({ error: "다른 사용자가 이 팀원의 배정을 변경했습니다. 최신 배정을 확인해주세요.", schedule: before ?? emptySchedule(member.id) }, 409);
    let after;
    try { after = applyBayCommand(before ?? emptySchedule(member.id), command, state.data.absences, actor.name, member.name, new Date().toISOString()); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "배정을 확인해주세요." }, 422); }
    if (after === before) return json({ schedule: before });
    const backup = await createStateBackup(state.data, state.updatedAt, "before-bay-write");
    if (isStoreFailure(backup)) return json({ error: "백업 생성에 실패하여 저장하지 않았습니다. 다시 시도해주세요." }, 503);
    const saved = await applyRecordChanges([{ collection: "baySchedules", id: member.id, before, after }], command.requestId);
    if (!saved || isStoreFailure(saved)) return json({ error: "저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해주세요." }, 503);
    if ("conflict" in saved) {
      const latest = await readCurrentState();
      return json({ error: "동시에 변경된 배정이 있습니다. 최신 배정을 확인해주세요.", schedule: latest && !isStoreFailure(latest) ? latest.data.baySchedules.find(s => s.id === member.id) ?? emptySchedule(member.id) : undefined }, 409);
    }
    return json({ schedule: saved.data.baySchedules.find(s => s.id === member.id) });
  } catch { return json({ error: "서버 연결이 끊겼습니다. 입력을 유지한 채 다시 저장해주세요." }, 503); }
}
