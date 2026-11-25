import { syncWardrobe, chooseWardrobeItem, validateEquipment, wardrobeCharacters } from "../lounge/wardrobe";
import { totalExpRequiredForLevel, normalizeExpProfile } from "../lounge/utils/exp";
import { archiveDrawing } from "./drawing-history";
import type { AppData } from "../data";
import { sameRecordValue, type RecordOperation } from "../state-operations";
import { getServerSiteConfig } from "../site-config";
import { initialLoungeBundle, loungeCollections, overlayLoungeBundles, updateLoungeBundle, type LoungeBundle } from "../lounge/atomic-state";
const prefix = `lounge-v1:${getServerSiteConfig().stateKey}:`;
type Row = { key: string; value: LoungeBundle; updated_at: string };
async function db(query: string, init: RequestInit = {}): Promise<Response> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Lounge store unavailable");
  return fetch(`${url}/rest/v1/app_state?${query}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000), headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
}
export async function readLoungeOverlay(data: AppData, updatedAt: string | null, withoutDrawings = false) {
  const select = withoutDrawings
    ? "updated_at,memberId:value->memberId,profile:value->profile,wardrobe:value->wardrobe,daily:value->daily"
    : "key,value,updated_at";
  const response = await db(new URLSearchParams({ key: `like.${prefix}%`, select }).toString());
  if (!response.ok) throw new Error("Lounge state read failed");
  const rows = await response.json() as (Row | (Pick<LoungeBundle, "memberId" | "profile" | "wardrobe" | "daily"> & {updated_at:string}))[];
  const bundles = rows.map(row => "value" in row ? row.value : { ...row, drawing: null });
  return { data: overlayLoungeBundles(data, bundles), updatedAt: rows.reduce((latest, r) => !latest || r.updated_at > latest ? r.updated_at : latest, updatedAt) };
}
export async function saveLoungeBundles(data: AppData, operations: RecordOperation[]) {
  const loungeOps = operations.filter(op => loungeCollections.has(op.collection));
  if (!loungeOps.length) return null;
  const removedMembers = new Set(operations.filter(op => op.collection === "members" && op.after === null).map(op => op.id));
  for (const memberId of Array.from(removedMembers)) {
    const prior = await db(`key=eq.${encodeURIComponent(prefix + memberId)}`);
    if (!prior.ok) throw new Error("Lounge read failed");
    const previous = (await prior.json() as Row[])[0]?.value.drawing ?? data.drawingSubmissions.find(d => d.memberId === memberId) ?? (operations.find(op => op.collection === "drawingSubmissions" && (op.before as {memberId?:string})?.memberId === memberId)?.before as LoungeBundle["drawing"]) ?? null;
    const removedName = (operations.find(op => op.collection === "members" && op.id === memberId)?.before as {name?:string})?.name ?? "이전 사용자";
    await archiveDrawing(previous, removedName);
    const response = await db(`key=eq.${encodeURIComponent(prefix + memberId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Lounge removal failed");
  }
  if (loungeOps.some(op => !op.after && !removedMembers.has((op.before as {memberId?:string})?.memberId ?? ""))) return { conflict: true as const, reason: "lounge_deletion_requires_review", collection: "characterProfiles", recordId: loungeOps[0].id };
  const committed = new Set<string>();
  // Audit rows are written last. Read old log IDs individually, even outside the UI's 80-row window.
  for (const op of operations.filter(op => op.collection === "auditLogs" && op.after)) {
    const key = `record-v2:${getServerSiteConfig().stateKey}:auditLogs:${op.id}`;
    const response = await db(`key=eq.${encodeURIComponent(key)}&select=value`);
    if (!response.ok) throw new Error("Audit verification failed");
    const rows = await response.json();
    if (rows[0]?.value.deleted === true || (rows[0]?.value.deleted === false && sameRecordValue(rows[0].value.item, op.after))) committed.add(op.id);
  }
  const members = Array.from(new Set(loungeOps.filter(op => op.after).map(op => (op.after as {memberId:string}).memberId)));
  for (const memberId of members) {
    if (!data.members.some(m => m.id === memberId)) return { conflict: true as const, reason: "unknown_member", collection: "characterProfiles", recordId: memberId };
    const key = prefix + memberId;
    const submitsDrawing = loungeOps.some(op => op.collection === "drawingSubmissions" && op.id === memberId);
    let saved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await db(`key=eq.${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error("Lounge state read failed");
      const row = (await response.json() as Row[])[0];
      const before = row?.value ?? initialLoungeBundle(data, memberId, operations);
      const memberName = data.members.find(m => m.id === memberId)?.name ?? "이전 사용자";
      if (submitsDrawing) await archiveDrawing(before.drawing, memberName);
      let next: LoungeBundle;
      try { next = updateLoungeBundle(before, operations, committed); }
      catch (error) { return { conflict: true as const, reason: error instanceof Error ? error.message : "lounge_conflict", collection: "characterProfiles", recordId: memberId }; }
      if (row && sameRecordValue(before, next)) { saved = true; break; }
      next.revision = before.revision + 1;
      const written = await db(row ? `key=eq.${encodeURIComponent(key)}&value->>revision=eq.${before.revision}` : "", { method: row ? "PATCH" : "POST", body: JSON.stringify({ key, value: next, updated_at: new Date().toISOString() }) });
      if (written.status === 409) continue;
      if (!written.ok) throw new Error("Lounge state write failed");
      if ((await written.json()).length) {
        if (submitsDrawing && next.drawing !== before.drawing) await archiveDrawing(next.drawing, memberName);
        saved = true;
        break;
      }
    }
    if (!saved) return { conflict: true as const, reason: "lounge_cas_exhausted", collection: "characterProfiles", recordId: memberId };
  }
  return null;
}

// The reward marker and EXP are committed together in the same member CAS row.
export async function awardDrawingVoteBonus(data: AppData, memberId: string, date: string, amount: number) {
  if (!data.members.some(m => m.id === memberId)) return {date, amount: 0, at: new Date().toISOString(), skipped: true};
  const key = prefix + memberId;
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await db(`key=eq.${encodeURIComponent(key)}`);
    if (!response.ok) throw new Error("Reward read failed");
    const row = (await response.json() as Row[])[0];
    const before = row?.value ?? initialLoungeBundle(data, memberId, []);
    if (before.drawingVoteRewards?.includes(date)) return before.drawingVoteRewardDetails?.find(r=>r.date===date) ?? {date,amount:null,at:null};
    const profile=normalizeExpProfile({...before.profile, exp: before.profile.exp + amount});
    const receipt={date,amount:totalExpRequiredForLevel(profile.level)+profile.exp-totalExpRequiredForLevel(before.profile.level)-before.profile.exp,at:new Date().toISOString()};
    const next: LoungeBundle = {...before, revision: before.revision + 1,
      profile, wardrobe:syncWardrobe(before.wardrobe,profile.level,profile.characterId), drawingVoteRewardDetails:[...(before.drawingVoteRewardDetails??[]),receipt],
      drawingVoteRewards: [...(before.drawingVoteRewards ?? []), date]};
    const written = await db(row ? `key=eq.${encodeURIComponent(key)}&value->>revision=eq.${before.revision}` : "", {method: row ? "PATCH" : "POST", body: JSON.stringify({key, value: next, updated_at: new Date().toISOString()})});
    if (written.status === 409) continue;
    if (!written.ok) throw new Error("Reward write failed");
    if ((await written.json()).length) return receipt;
  }
  throw new Error("Reward write conflict");
}

export async function readDrawingVoteRewards(memberId: string) {
  if (!memberId) return [];
  const response=await db(`key=eq.${encodeURIComponent(prefix+memberId)}`);
  if(!response.ok)throw new Error("Reward history unavailable");
  const bundle=((await response.json()) as Row[])[0]?.value;
  return (bundle?.drawingVoteRewards??[]).map(date=>bundle?.drawingVoteRewardDetails?.find(r=>r.date===date)??{date,amount:null,at:null}).sort((a,b)=>b.date.localeCompare(a.date));
}

export type WardrobeCommand = {kind:'read'} | {kind:'claim';itemId:string} | {kind:'equip';characterId:import('../lounge/types').CharacterId;equipment:unknown;before:unknown;previousCharacterId:string};
export async function updateWardrobe(data:AppData,memberId:string,command:WardrobeCommand) {
  if(!data.members.some(m=>m.id===memberId&&m.active))throw new Error('사용자를 다시 선택해주세요.');
  const key=prefix+memberId;
  for(let attempt=0;attempt<8;attempt++) {
    const response=await db(`key=eq.${encodeURIComponent(key)}`);
    if(!response.ok)throw new Error('꾸미기 정보를 불러오지 못했습니다.');
    const row=(await response.json() as Row[])[0];
    const before=row?.value??initialLoungeBundle(data,memberId,[]);
    const profile=normalizeExpProfile(before.profile);
    let wardrobe=syncWardrobe(before.wardrobe,profile.level,profile.characterId);
    if(command.kind==='claim')wardrobe=chooseWardrobeItem(wardrobe,command.itemId,profile.level);
    if(command.kind==='equip') {
      if(!wardrobeCharacters.includes(command.characterId))throw new Error('캐릭터를 확인해주세요.');
      const equipment=validateEquipment(wardrobe,command.equipment);
      const current=wardrobe.equipped[command.characterId]??{};
      if(!sameRecordValue(current,command.before)&&!sameRecordValue(current,equipment))throw new Error('다른 창에서 착장이 변경됐어요. 창을 다시 열어 확인해주세요.');
      if(profile.characterId!==command.previousCharacterId&&profile.characterId!==command.characterId)throw new Error('다른 창에서 캐릭터가 변경됐어요. 창을 다시 열어 확인해주세요.');
      wardrobe={...wardrobe,equipped:{...wardrobe.equipped,[command.characterId]:equipment}};
      profile.characterId=command.characterId;
    }
    const next:LoungeBundle={...before,profile,wardrobe,revision:before.revision+1};
    if(row&&sameRecordValue(before.wardrobe,wardrobe)&&sameRecordValue(before.profile,profile))return {...profile,wardrobe};
    const written=await db(row?`key=eq.${encodeURIComponent(key)}&value->>revision=eq.${before.revision}`:'',{method:row?'PATCH':'POST',body:JSON.stringify({key,value:next,updated_at:new Date().toISOString()})});
    if(written.status===409)continue;
    if(!written.ok)throw new Error('꾸미기 저장 서버에 연결하지 못했습니다.');
    if((await written.json()).length)return {...profile,wardrobe};
  }
  throw new Error('저장이 겹쳤어요. 잠시 후 다시 적용해주세요.');
}
