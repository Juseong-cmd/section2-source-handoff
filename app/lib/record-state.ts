import { repairDrawingHistory } from "./drawing-history";
import { readLoungeOverlay, saveLoungeBundles } from "./lounge-store";
import { loungeCollections } from "../lounge/atomic-state";
import { initialData, type AppData, type FeedbackComment, type FeedbackPost, type FeedbackReply, type OvertimeLog } from "../data";
import { getServerSiteConfig } from "../site-config";
import { normalizeExpProfile } from "../lounge/utils/exp";
import {
  isRecordCollection,
  sameRecordValue,
  commandCollections,
  recordCollections,
  recordIdentity,
  type RecordCollection,
  type RecordOperation,
} from "../state-operations";

const { stateKey, backupPrefix } = getServerSiteConfig();
const recordPrefix = `record-v2:${stateKey}:`;
const markerKey = `${recordPrefix}__meta__`;
const activeBackupIntervalMs = 30 * 60 * 1000;
const quietBackupIntervalMs = 2 * 60 * 60 * 1000;
const backupRetentionMs = 14 * 24 * 60 * 60 * 1000;
const pageSize = 1000;
const writeAttempts = 4;

type StoreFailure = { error: string; status: number };
export type StateSnapshot = { data: AppData; updatedAt: string | null };

type RecordValue = {
  schemaVersion: 2;
  collection: RecordCollection;
  id: string;
  item: unknown | null;
  deleted: boolean;
  index: number;
  revision: number;
  requestId: string;
};

type StateRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

type RecordRow = StateRow & { value: RecordValue };

export function isStoreFailure(value: unknown): value is StoreFailure {
  return Boolean(value && typeof value === "object" && "error" in value && "status" in value);
}

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

function normalizeReply(value: Partial<FeedbackReply>, fallbackId: string): FeedbackReply {
  return {
    id: value.id || fallbackId,
    author: value.author || "미지정",
    body: value.body || "",
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt,
  };
}

function normalizeComment(value: Partial<FeedbackComment>, fallbackId: string): FeedbackComment {
  return {
    id: value.id || fallbackId,
    author: value.author || "미지정",
    body: value.body || "",
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt,
    replies: (value.replies ?? []).map((reply, index) => normalizeReply(reply, `${fallbackId}-reply-${index}`)),
  };
}

function normalizeOvertimeLog(value: Partial<OvertimeLog>, fallbackId: string): OvertimeLog {
  return {
    id: value.id || fallbackId,
    date: value.date || "",
    memberId: value.memberId || "",
    memberName: value.memberName || "알 수 없음",
    action: value.action === "removed" ? "removed" : "assigned",
    method: value.method === "random" ? "random" : value.method === "self" ? "self" : "agree",
    actor: value.actor || "미지정",
    at: value.at || new Date().toISOString(),
  };
}

function normalizeAbsence(value: Partial<AppData["absences"][number]>): AppData["absences"][number] {
  const legacyType = String(value.type || "annual");
  const type: AppData["absences"][number]["type"] =
    legacyType === "vacation" ? "annual" : legacyType === "out" ? "flex" : legacyType === "training" || legacyType === "flex" || legacyType === "family" || legacyType === "etc" ? legacyType : "annual";
  return {
    id: value.id || `abs-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    memberId: value.memberId || "",
    startDate: value.startDate || "",
    endDate: value.endDate || value.startDate || "",
    type,
    label: value.label || "",
    memo: value.memo || "",
    flexTime: type === "flex" ? value.flexTime || "" : "",
  };
}

function normalizeFeedback(value: unknown, index: number): FeedbackPost {
  const feedback = (value && typeof value === "object" ? value : {}) as Partial<FeedbackPost> & { response?: string };
  const createdAt = feedback.createdAt || new Date().toISOString();
  const id = feedback.id || `update-${index}`;

  if (Array.isArray(feedback.comments)) {
    return {
      id,
      author: feedback.author || "미지정",
      title: feedback.title || "업데이트",
      body: feedback.body || "",
      comments: feedback.comments.map((comment, commentIndex) => normalizeComment(comment, `${id}-comment-${commentIndex}`)),
      createdAt,
      updatedAt: feedback.updatedAt || createdAt,
    };
  }

  const legacyBody = [feedback.title, feedback.body].filter(Boolean).join("\n");
  return {
    id,
    author: "관리자",
    title: "업데이트 내역",
    body: "기존 개선의견 게시판 내용을 댓글과 답글 형태로 이관했습니다.",
    comments: legacyBody
      ? [{
          id: `${id}-comment`,
          author: feedback.author || "미지정",
          body: legacyBody,
          createdAt,
          replies: feedback.response
            ? [{ id: `${id}-reply`, author: "관리자", body: feedback.response, createdAt: feedback.updatedAt || createdAt }]
            : [],
        }]
      : [],
    createdAt,
    updatedAt: feedback.updatedAt || createdAt,
  };
}

export function normalizeData(value: unknown): AppData {
  const parsed = { ...initialData, ...(value && typeof value === "object" ? value : {}) } as AppData;
  return {
    ...parsed,
    baySchedules: parsed.baySchedules ?? [],
    commonEvents: parsed.commonEvents ?? [],
    commonResponses: parsed.commonResponses ?? [],
    members: (parsed.members ?? []).map((member) => ({ ...member, active: member.active ?? true })),
    equipments: parsed.equipments ?? [],
    absences: (parsed.absences ?? []).map(normalizeAbsence),
    availability: parsed.availability ?? [],
    assignments: parsed.assignments ?? [],
    overtimeLogs: (parsed.overtimeLogs ?? []).map((log, index) => normalizeOvertimeLog(log, `ot-log-${index}`)).slice(0, 160),
    equipmentBlocks: parsed.equipmentBlocks ?? [],
    auditLogs: (parsed.auditLogs ?? []).slice(0, 80),
    feedbacks: (parsed.feedbacks ?? []).map(normalizeFeedback),
    dashboardComments: (parsed.dashboardComments ?? []).map((comment, index) => normalizeComment(comment, `dashboard-comment-${index}`)),
    characterProfiles: (parsed.characterProfiles ?? []).map(normalizeExpProfile),
    dailyCharacterExp: parsed.dailyCharacterExp ?? [],
    drawingSubmissions: parsed.drawingSubmissions ?? [],
  };
}

function isRecordValue(value: unknown): value is RecordValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecordValue>;
  return candidate.schemaVersion === 2 && isRecordCollection(candidate.collection) && typeof candidate.id === "string";
}

function makeRecordKey(collection: RecordCollection, id: string) {
  return `${recordPrefix}${collection}:${id}`;
}

async function readLegacyState(): Promise<StateSnapshot | StoreFailure | null> {
  const response = await supabaseFetch(`app_state?key=eq.${encodeURIComponent(stateKey)}&select=value,updated_at`);
  if (!response) return null;
  if (!response.ok) return { error: await response.text(), status: response.status };
  const rows = (await response.json()) as Pick<StateRow, "value" | "updated_at">[];
  if (rows.length === 0) return { data: normalizeData(initialData), updatedAt: null };
  return { data: normalizeData(rows[0].value), updatedAt: rows[0].updated_at };
}

async function readMarker(): Promise<StateRow | StoreFailure | null> {
  const response = await supabaseFetch(`app_state?key=eq.${encodeURIComponent(markerKey)}&select=key,value,updated_at`);
  if (!response) return null;
  if (!response.ok) return { error: await response.text(), status: response.status };
  const rows = (await response.json()) as StateRow[];
  return rows[0] ?? null;
}

async function readRecordRows(collections?: RecordCollection[]): Promise<RecordRow[] | StoreFailure | null> {
  const rows: RecordRow[] = [];
  const filters = new URLSearchParams({ select: "key,value,updated_at", order: "key.asc" });
  if (collections) {
    filters.set("or", `(${collections.map(collection => `key.like.${recordPrefix}${collection}:*`).join(",")})`);
  } else {
    filters.set("key", `like.${recordPrefix}%`);
  }
  for (let start = 0; ; start += pageSize) {
    const response = await supabaseFetch(
      `app_state?${filters}`,
      { headers: { Range: `${start}-${start + pageSize - 1}`, "Range-Unit": "items" } },
    );
    if (!response) return null;
    if (!response.ok) return { error: await response.text(), status: response.status };
    const page = (await response.json()) as StateRow[];
    rows.push(...page.filter((row): row is RecordRow => isRecordValue(row.value)));
    if (page.length < pageSize) break;
  }
  return rows;
}

async function migrateLegacyState(): Promise<StoreFailure | null> {
  const legacy = await readLegacyState();
  if (!legacy || isStoreFailure(legacy)) return legacy;
  const migratedAt = new Date().toISOString();
  const rowUpdatedAt = legacy.updatedAt ?? migratedAt;
  const rows = recordCollections.flatMap((collection) =>
    (legacy.data[collection] as unknown[]).map((item, index) => {
      const id = recordIdentity(collection, item);
      return {
        key: makeRecordKey(collection, id),
        value: {
          schemaVersion: 2,
          collection,
          id,
          item,
          deleted: false,
          index,
          revision: 1,
          requestId: "legacy-migration",
        } satisfies RecordValue,
        updated_at: rowUpdatedAt,
      };
    }),
  );

  for (let index = 0; index < rows.length; index += 100) {
    const response = await supabaseFetch("app_state?on_conflict=key", {
      method: "POST",
      body: JSON.stringify(rows.slice(index, index + 100)),
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
    if (!response) return null;
    if (!response.ok) return { error: await response.text(), status: response.status };
  }

  const markerResponse = await supabaseFetch("app_state?on_conflict=key", {
    method: "POST",
    body: JSON.stringify({
      key: markerKey,
      value: { schemaVersion: 2, migratedAt, sourceUpdatedAt: legacy.updatedAt, recordCount: rows.length },
      updated_at: migratedAt,
    }),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
  if (!markerResponse) return null;
  if (!markerResponse.ok) return { error: await markerResponse.text(), status: markerResponse.status };
  console.info("[state] record store migrated", JSON.stringify({ stateKey, recordCount: rows.length }));
  return null;
}

function snapshotFromRows(rows: RecordRow[], markerUpdatedAt: string | null): StateSnapshot {
  const grouped = new Map<RecordCollection, RecordRow[]>(recordCollections.map((collection) => [collection, []]));
  for (const row of rows) grouped.get(row.value.collection)?.push(row);

  const assembled = Object.fromEntries(recordCollections.map((collection) => {
    const items = (grouped.get(collection) ?? [])
      .filter((row) => !row.value.deleted && row.value.item !== null)
      .sort((left, right) => collection === "auditLogs"
        ? String((right.value.item as { at?: string }).at ?? "").localeCompare(String((left.value.item as { at?: string }).at ?? "")) || right.value.id.localeCompare(left.value.id)
        : left.value.index - right.value.index || right.updated_at.localeCompare(left.updated_at))
      .map((row) => row.value.item);
    return [collection, items];
  })) as AppData;
  const updatedAt = rows.reduce<string | null>(
    (latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest,
    markerUpdatedAt,
  );
  return { data: normalizeData(assembled), updatedAt };
}

export async function readCurrentState({
  collections,
  withoutDrawings = false,
}: { collections?: RecordCollection[]; withoutDrawings?: boolean } = {}): Promise<StateSnapshot | StoreFailure | null> {
  let marker = await readMarker();
  if (isStoreFailure(marker)) return marker;
  if (!marker) {
    const migrationFailure = await migrateLegacyState();
    if (migrationFailure) return migrationFailure;
    marker = await readMarker();
    if (!marker || isStoreFailure(marker)) return marker;
  }
  const selectedCollections = withoutDrawings ? recordCollections.filter(collection => collection !== "drawingSubmissions") : collections;
  const rows = await readRecordRows(selectedCollections);
  if (!rows || isStoreFailure(rows)) return rows;
  const snapshot = snapshotFromRows(rows, marker.updated_at);
  if (collections) return snapshot;
  try { return await readLoungeOverlay(snapshot.data, snapshot.updatedAt, withoutDrawings); }
  catch { return { error: "Lounge state unavailable", status: 503 }; }
}

async function readRecordRow(collection: RecordCollection, id: string): Promise<RecordRow | StoreFailure | null> {
  const response = await supabaseFetch(
    `app_state?key=eq.${encodeURIComponent(makeRecordKey(collection, id))}&select=key,value,updated_at`,
  );
  if (!response) return null;
  if (!response.ok) return { error: await response.text(), status: response.status };
  const rows = (await response.json()) as StateRow[];
  const row = rows[0];
  return row && isRecordValue(row.value) ? row as RecordRow : null;
}

function sameValue(left: unknown, right: unknown) {
  return sameRecordValue(left, right);
}

function normalizeRecordItem(collection: RecordCollection, item: unknown | null) {
  if (item === null) return null;
  const normalized = normalizeData({ [collection]: [item] });
  return (normalized[collection] as unknown[])[0] ?? null;
}

type MergeResult = { ok: true; value: unknown } | { ok: false };

function mergeThreeWay(base: unknown, incoming: unknown, latest: unknown, field = ""): MergeResult {
  if (sameValue(incoming, base)) return { ok: true, value: latest };
  if (sameValue(latest, base) || sameValue(incoming, latest)) return { ok: true, value: incoming };
  if (field === "updatedAt" && typeof incoming === "string" && typeof latest === "string") {
    return { ok: true, value: incoming > latest ? incoming : latest };
  }

  if (Array.isArray(incoming) && Array.isArray(latest) && (Array.isArray(base) || base === undefined)) {
    const baseItems = Array.isArray(base) ? base : [];
    const hasIds = [...baseItems, ...incoming, ...latest].every(
      (item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string",
    );
    if (!hasIds) return { ok: false };
    const byId = (items: unknown[]) => new Map(items.map((item) => [(item as { id: string }).id, item]));
    const baseById = byId(baseItems);
    const incomingById = byId(incoming);
    const latestById = byId(latest);
    const ids = [
      ...Array.from(latestById.keys()),
      ...Array.from(incomingById.keys()).filter((id) => !latestById.has(id)),
    ];
    const merged: unknown[] = [];
    for (const id of ids) {
      const itemResult = mergeThreeWay(baseById.get(id), incomingById.get(id), latestById.get(id));
      if (!itemResult.ok) return itemResult;
      if (itemResult.value !== undefined) merged.push(itemResult.value);
    }
    return { ok: true, value: merged };
  }

  const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (isObject(incoming) && isObject(latest) && (isObject(base) || base === undefined)) {
    const baseObject = isObject(base) ? base : {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(incoming), ...Object.keys(latest)]);
    const merged: Record<string, unknown> = {};
    for (const key of Array.from(keys)) {
      const fieldResult = mergeThreeWay(baseObject[key], incoming[key], latest[key], key);
      if (!fieldResult.ok) return fieldResult;
      if (fieldResult.value !== undefined) merged[key] = fieldResult.value;
    }
    return { ok: true, value: merged };
  }

  return { ok: false };
}

function validOperation(value: unknown): value is RecordOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<RecordOperation>;
  if (!isRecordCollection(operation.collection) || typeof operation.id !== "string" || !operation.id) return false;
  if (operation.after !== null && recordIdentity(operation.collection, operation.after) !== operation.id) return false;
  if (operation.before !== null && recordIdentity(operation.collection, operation.before) !== operation.id) return false;
  return true;
}

export function parseOperations(value: unknown): RecordOperation[] | null {
  if (!Array.isArray(value) || !value.every(validOperation)) return null;
  const keys = new Set<string>();
  for (const operation of value) {
    const key = `${operation.collection}:${operation.id}`;
    if (keys.has(key)) return null;
    keys.add(key);
  }
  return value.slice(0, 500);
}

async function applyOperation(operation: RecordOperation, requestId: string): Promise<StoreFailure | { conflict: true; reason: string } | null> {
  if (operation.collection === "auditLogs" && operation.after === null) return null;
  const normalizedBefore = normalizeRecordItem(operation.collection, operation.before);
  const normalizedAfter = normalizeRecordItem(operation.collection, operation.after);
  for (let attempt = 0; attempt < writeAttempts; attempt += 1) {
    const row = await readRecordRow(operation.collection, operation.id);
    if (isStoreFailure(row)) return row;
    const current = row && !row.value.deleted ? normalizeRecordItem(operation.collection, row.value.item) : null;
    if (sameValue(current, normalizedAfter)) return null;

    if (operation.collection === "auditLogs") {
      if (row?.value.deleted) return null; // Legacy retries cannot resurrect removed history.
      if (current !== null) return { conflict: true, reason: "immutable_history" };
    }
    let target: unknown | null = normalizedAfter;
    if (!sameValue(current, normalizedBefore)) {
      if (commandCollections.includes(operation.collection)) return { conflict: true, reason: "revision_conflict" };
      if (normalizedBefore === null || normalizedAfter === null || current === null) return { conflict: true, reason: "record_existence_conflict" };
      const merged = mergeThreeWay(normalizedBefore, normalizedAfter, current);
      if (!merged.ok) return { conflict: true, reason: "field_conflict" };
      target = merged.value;
    }

    const now = new Date().toISOString();
    const value: RecordValue = {
      schemaVersion: 2,
      collection: operation.collection,
      id: operation.id,
      item: target,
      deleted: target === null,
      index: row?.value.index ?? operation.index ?? 0,
      revision: (row?.value.revision ?? 0) + 1,
      requestId,
    };
    if (row) {
      const revisionFilter = commandCollections.includes(operation.collection) ? `&${encodeURIComponent("value->>revision")}=eq.${row.value.revision}` : "";
      const response = await supabaseFetch(
        `app_state?key=eq.${encodeURIComponent(row.key)}&updated_at=eq.${encodeURIComponent(row.updated_at)}${revisionFilter}`,
        { method: "PATCH", body: JSON.stringify({ value, updated_at: now }) },
      );
      if (!response) return { error: "Supabase configuration unavailable", status: 503 };
      if (!response.ok) return { error: await response.text(), status: response.status };
      const changed = (await response.json()) as StateRow[];
      if (changed.length > 0) return null;
      continue;
    }

    const response = await supabaseFetch("app_state", {
      method: "POST",
      body: JSON.stringify({ key: makeRecordKey(operation.collection, operation.id), value, updated_at: now }),
    });
    if (!response) return { error: "Supabase configuration unavailable", status: 503 };
    if (response.ok) return null;
    if (response.status !== 409) return { error: await response.text(), status: response.status };
  }
  return { conflict: true, reason: "cas_exhausted" };
}

export async function applyRecordChanges(operations: RecordOperation[], requestId: string) {
  let completedOperations = 0;
  const hasLounge = operations.some(op => loungeCollections.has(op.collection));
  const removedMembers = new Set(operations.filter(op => op.collection === "members" && op.after === null).map(op => op.id));
  const business = operations.filter(op => op.collection !== "auditLogs" && (!loungeCollections.has(op.collection) || (op.after === null && removedMembers.has((op.before as {memberId?:string})?.memberId ?? ""))));
  const audits = operations.filter(op => op.collection === "auditLogs");
  for (const operation of business) {
    let effective = operation;
    if (loungeCollections.has(operation.collection) && operation.after === null) {
      const old = await readRecordRow(operation.collection, operation.id);
      if (isStoreFailure(old)) return old;
      effective = { ...operation, before: old?.value.item ?? null };
    }
    const result = await applyOperation(effective, requestId);
    if (result) return "conflict" in result ? { ...result, collection: operation.collection, recordId: operation.id, completedOperations } : result;
    completedOperations += 1;
  }
  if (hasLounge) {
    const latest = await readCurrentState();
    if (!latest || isStoreFailure(latest)) return latest;
    try {
      const result = await saveLoungeBundles(latest.data, operations);
      if (result) return { ...result, completedOperations };
    } catch { return { error: "Lounge transaction unavailable", status: 503 }; }
    completedOperations += operations.filter(op => loungeCollections.has(op.collection)).length;
  }
  for (const operation of audits) {
    const result = await applyOperation(operation, requestId);
    if (result) return "conflict" in result ? { ...result, collection: operation.collection, recordId: operation.id, completedOperations } : result;
    completedOperations += 1;
  }
  return readCurrentState();
}

function isActiveWorkTimeKst(date: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(date));
  return hour >= 8 && hour < 17;
}

function backupIntervalMs(date: Date) {
  return isActiveWorkTimeKst(date) ? activeBackupIntervalMs : quietBackupIntervalMs;
}

function backupKey(date: Date) {
  return `${backupPrefix}${date.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
}

async function readLatestBackup() {
  const response = await supabaseFetch(
    `app_state?key=like.${encodeURIComponent(backupPrefix)}%25&select=key,updated_at&order=updated_at.desc&limit=1`,
  );
  if (!response || !response.ok) return null;
  const rows = (await response.json()) as Pick<StateRow, "key" | "updated_at">[];
  return rows[0] ?? null;
}

async function cleanupOldBackups(now: Date) {
  const cutoff = new Date(now.getTime() - backupRetentionMs).toISOString();
  await supabaseFetch(`app_state?key=like.${encodeURIComponent(backupPrefix)}%25&updated_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
  });
}

export async function createStateBackup(data: AppData, sourceUpdatedAt: string | null, reason: string, force = false) {
  const now = new Date();
  if (!force) {
    const latest = await readLatestBackup();
    if (latest) {
      const lastAt = new Date(latest.updated_at).getTime();
      if (Number.isFinite(lastAt) && now.getTime() - lastAt < backupIntervalMs(now)) {
        return { backedUp: false as const, reason: "not_due", latestBackupAt: latest.updated_at };
      }
    }
  }

  const key = backupKey(now);
  const response = await supabaseFetch("app_state?on_conflict=key", {
    method: "POST",
    body: JSON.stringify({
      key,
      value: { reason, sourceUpdatedAt, backedUpAt: now.toISOString(), data },
      updated_at: now.toISOString(),
    }),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  if (!response) return { error: "Supabase configuration unavailable", status: 503 };
  if (!response.ok) return { error: await response.text(), status: response.status };
  await cleanupOldBackups(now);
  return { backedUp: true as const, key, sourceUpdatedAt };
}

export async function backupCurrentState(force = false, reason = force ? "manual" : "scheduled") {
  const state = await readCurrentState();
  if (!state || isStoreFailure(state)) return state;
  const result = await createStateBackup(state.data, state.updatedAt, reason, force);
  if (!isStoreFailure(result)) {
    try { await repairDrawingHistory(state.data); }
    catch { console.error("[drawing-history] scheduled archive repair failed"); }
  }
  return result;
}
