import type { AppData, AuditLog } from "../data";
import type { RecordOperation } from "../state-operations";
import type { CharacterProfile, DailyExpRecord, DrawingSubmission } from "./types";
import { grantExp, normalizeExpProfile, requestedExp } from "./utils/exp.ts";

import { syncWardrobe, type WardrobeState } from "./wardrobe.ts";

export const loungeCollections = new Set(["characterProfiles", "dailyCharacterExp", "drawingSubmissions"]);
export type LoungeBundle = { schemaVersion: 1; wardrobe?: WardrobeState; revision: number; memberId: string; profile: CharacterProfile; daily: DailyExpRecord[]; drawing: DrawingSubmission | null; appliedLogIds: string[]; drawingVoteRewardDetails?: {date: string; amount: number; at: string}[]; drawingVoteRewards?: string[] };
const dateOf = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));

export function initialLoungeBundle(data: AppData, memberId: string, operations: RecordOperation[]): LoungeBundle {
  const profileOp = operations.find(op => op.collection === "characterProfiles" && op.id === memberId);
  const importing = operations.some(op => op.collection === "auditLogs" && (op.after as AuditLog | null)?.action === "캐릭터 정보 이전");
  const imported = (profileOp?.before ?? (importing ? profileOp?.after : null)) as CharacterProfile | null;
  const profile = data.characterProfiles.find(p => p.memberId === memberId) ?? imported ?? { memberId, characterId: "rabbit", level: 1, exp: 0, expVersion: 2 };
  return { schemaVersion: 1, revision: 0, memberId, profile: normalizeExpProfile(profile), wardrobe: syncWardrobe(undefined,profile.level,profile.characterId), daily: data.dailyCharacterExp.filter(d => d.memberId === memberId), drawing: data.drawingSubmissions.find(d => d.memberId === memberId) ?? null, appliedLogIds: [] };
}

export function updateLoungeBundle(bundle: LoungeBundle, operations: RecordOperation[], committedLogs: Set<string>): LoungeBundle {
  const next: LoungeBundle = { ...bundle, profile: { ...bundle.profile }, daily: bundle.daily.map(d => ({ ...d })), appliedLogIds: [...bundle.appliedLogIds] };
  const logs = operations.filter(op => op.collection === "auditLogs" && op.after).map(op => op.after as AuditLog);
  const fresh = logs.filter(log => !committedLogs.has(log.id) && !bundle.appliedLogIds.includes(log.id));
  const relevant = operations.filter(op => loungeCollections.has(op.collection) && (op.after as {memberId?: string} | null)?.memberId === bundle.memberId);
  if (!logs.length && relevant.length) throw new Error("lounge_action_required");
  const profileOp = relevant.find(op => op.collection === "characterProfiles");
  const incomingProfile = profileOp?.after as CharacterProfile | undefined;
  const beforeProfile = profileOp?.before as CharacterProfile | null;
  if (incomingProfile && fresh.some(log => log.action === "캐릭터 변경")) {
    if (beforeProfile && bundle.profile.characterId !== beforeProfile.characterId && bundle.profile.characterId !== incomingProfile.characterId) throw new Error("character_selection_conflict");
    next.profile.characterId = incomingProfile.characterId;
  }
  const incomingDrawing = relevant.find(op => op.collection === "drawingSubmissions")?.after as DrawingSubmission | undefined;
  const drawingAccepted = Boolean(incomingDrawing && fresh.some(log => log.action === "드로잉 제출") && (!bundle.drawing || incomingDrawing.date > bundle.drawing.date));
  if (drawingAccepted) next.drawing = incomingDrawing!;
  for (const operation of relevant.filter(op => op.collection === "dailyCharacterExp")) {
    const incoming = operation.after as DailyExpRecord;
    const before = operation.before as DailyExpRecord | null;
    const rewardLimit = fresh.filter(log => Number.isFinite(Date.parse(log.at)) && dateOf(log.at) === incoming.date).reduce((sum, log) => {
      if (log.action === "드로잉 제출") return sum + (drawingAccepted ? requestedExp("drawing", incomingDrawing?.score) : 0);
      if (log.action === "캐릭터 EXP 획득" || log.action.startsWith("부재 등록:") || log.action.startsWith("잔업 등록:") || log.action.startsWith("잔업 확정:")) return sum + requestedExp("schedule");
      return sum;
    }, 0);
    const requested = Math.min(rewardLimit, Math.max(0, incoming.amount - (before?.amount ?? 0)));
    if (!requested) continue;
    const current = next.daily.find(d => d.date === incoming.date) ?? { memberId: bundle.memberId, date: incoming.date, amount: 0 };
    const awarded = grantExp(next.profile, current, requested);
    next.profile = awarded.profile;
    next.daily = [...next.daily.filter(d => d.date !== incoming.date), awarded.dailyRecord];
  }
  next.appliedLogIds = Array.from(new Set([...next.appliedLogIds, ...logs.map(log => log.id)]));
  next.wardrobe = syncWardrobe(next.wardrobe,next.profile.level,next.profile.characterId);
  return next;
}

export function overlayLoungeBundles(data: AppData, bundles: Pick<LoungeBundle, "memberId" | "profile" | "wardrobe" | "daily" | "drawing">[]): AppData {
  bundles = bundles.filter(b => data.members.some(m => m.id === b.memberId));
  const ids = new Set(bundles.map(b => b.memberId));
  return { ...data,
    characterProfiles: [...data.characterProfiles.filter(p => !ids.has(p.memberId)), ...bundles.map(b => ({...b.profile,wardrobe:syncWardrobe(b.wardrobe,b.profile.level,b.profile.characterId)}))],
    dailyCharacterExp: [...data.dailyCharacterExp.filter(d => !ids.has(d.memberId)), ...bundles.flatMap(b => b.daily)],
    drawingSubmissions: [...data.drawingSubmissions.filter(d => !ids.has(d.memberId)), ...bundles.flatMap(b => b.drawing ? [b.drawing] : [])],
  };
}
