import type { AppData } from "./data";

export const recordCollections = [
  "baySchedules",
  "commonEvents",
  "commonResponses",
  "members",
  "equipments",
  "absences",
  "availability",
  "assignments",
  "overtimeLogs",
  "equipmentBlocks",
  "auditLogs",
  "feedbacks",
  "dashboardComments",
  "characterProfiles",
  "dailyCharacterExp",
  "drawingSubmissions",
] as const;

export type RecordCollection = (typeof recordCollections)[number];
export const commandCollections: readonly RecordCollection[] = ["baySchedules", "commonEvents", "commonResponses"];

export type RecordOperation = {
  collection: RecordCollection;
  id: string;
  before: unknown | null;
  after: unknown | null;
  index?: number;
};

export function isRecordCollection(value: unknown): value is RecordCollection {
  return typeof value === "string" && (recordCollections as readonly string[]).includes(value);
}

export function sameRecordValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => sameRecordValue(value, right[index]));
  if (isObject(left) && isObject(right)) return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && sameRecordValue(left[key], right[key]));
  return false;
}
const sameValue = sameRecordValue;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rebaseChangedValue(base: unknown, incoming: unknown, latest: unknown, strict = false): unknown {
  if (sameValue(incoming, latest) || sameValue(base, latest)) return incoming;
  if (sameValue(incoming, base)) return latest;
  if (isObject(base) && isObject(incoming) && isObject(latest)) {
    const rebased: Record<string, unknown> = { ...latest };
    const keys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
    for (const key of Array.from(keys)) {
      if (!(key in incoming)) {
        if (key in base) {
          if (strict && key in latest && !sameValue(base[key], latest[key])) throw new Error("동일 항목이 다른 창에서 변경되었습니다. 미저장 내용을 확인해주세요.");
          delete rebased[key];
        }
        continue;
      }
      rebased[key] = rebaseChangedValue(base[key], incoming[key], latest[key], strict);
    }
    return rebased;
  }
  if (strict) throw new Error("동일 항목이 다른 창에서 변경되었습니다. 미저장 내용을 확인해주세요.");
  return incoming;
}

export function recordIdentity(collection: RecordCollection, item: unknown) {
  const value = item as { id?: unknown; memberId?: unknown; date?: unknown };
  if (collection === "characterProfiles" && typeof value.memberId === "string") {
    return value.memberId;
  }
  if (collection === "drawingSubmissions" && typeof value.memberId === "string") {
    return value.memberId;
  }
  if (collection === "availability" || collection === "assignments" || collection === "dailyCharacterExp") {
    if (typeof value.memberId === "string" && typeof value.date === "string") {
      return `${value.memberId}|${value.date}`;
    }
  }
  return typeof value.id === "string" ? value.id : "";
}

export function buildRecordOperations(baseData: AppData, nextData: AppData): RecordOperation[] {
  const operations: RecordOperation[] = [];

  for (const collection of recordCollections) {
    // Bay schedules are saved only by the revision-checked command endpoint.
    if (commandCollections.includes(collection)) continue;
    const beforeItems = (baseData[collection] ?? []) as unknown[];
    const afterItems = (nextData[collection] ?? []) as unknown[];
    const beforeById = new Map(beforeItems.map((item) => [recordIdentity(collection, item), item]));
    const afterById = new Map(afterItems.map((item) => [recordIdentity(collection, item), item]));

    for (const [id, before] of Array.from(beforeById.entries())) {
      if (collection !== "auditLogs" && id && !afterById.has(id)) {
        operations.push({ collection, id, before, after: null });
      }
    }

    afterItems.forEach((after, index) => {
      const id = recordIdentity(collection, after);
      if (!id) return;
      const before = beforeById.get(id) ?? null;
      if (!sameValue(before, after)) {
        operations.push({ collection, id, before, after, index });
      }
    });
  }

  return operations.sort((left, right) => {
    const priority = (collection: RecordCollection) =>
      collection === "auditLogs" ? 2 : collection === "overtimeLogs" ? 1 : 0;
    return priority(left.collection) - priority(right.collection);
  });
}

export function applyRecordOperations(data: AppData, operations: RecordOperation[]): AppData {
  const next = { ...data } as AppData;

  for (const collection of recordCollections) {
    const relevant = operations.filter((operation) => operation.collection === collection);
    if (relevant.length === 0) continue;

    const items = [...(next[collection] as unknown[])];
    for (const operation of relevant) {
      if (collection === "auditLogs" && operation.after === null) continue;
      const currentIndex = items.findIndex((item) => recordIdentity(collection, item) === operation.id);
      if (operation.after === null) {
        if (currentIndex >= 0) items.splice(currentIndex, 1);
        continue;
      }
      if (currentIndex >= 0) {
        items[currentIndex] = operation.after;
        continue;
      }
      const insertAt = Math.max(0, Math.min(operation.index ?? items.length, items.length));
      items.splice(insertAt, 0, operation.after);
    }
    (next[collection] as unknown[]) = items;
  }

  return next;
}

export function rebaseRecordOperations(data: AppData, operations: RecordOperation[], strict = false): AppData {
  const next = { ...data } as AppData;

  for (const collection of recordCollections) {
    const relevant = operations.filter((operation) => operation.collection === collection);
    if (relevant.length === 0) continue;

    const items = [...(next[collection] as unknown[])];
    for (const operation of relevant) {
      if (collection === "auditLogs" && operation.after === null) continue;
      const currentIndex = items.findIndex((item) => recordIdentity(collection, item) === operation.id);
      if (operation.after === null) {
        if (currentIndex >= 0) {
          if (strict && !sameValue(operation.before, items[currentIndex])) throw new Error("삭제 대상이 변경되었습니다. 미저장 내용을 확인해주세요.");
          items.splice(currentIndex, 1);
        }
        continue;
      }
      if (currentIndex >= 0 && operation.before !== null) {
        items[currentIndex] = rebaseChangedValue(operation.before, operation.after, items[currentIndex], strict);
        continue;
      }
      if (currentIndex >= 0) {
        if (strict && !sameValue(operation.after, items[currentIndex])) throw new Error("같은 ID의 데이터가 이미 저장되어 있습니다. 미저장 내용을 확인해주세요.");
        if (collection === "characterProfiles") {
          const incoming = operation.after as Record<string, unknown>;
          const defaultProfile = { ...incoming, characterId: "rabbit", level: 1, exp: 0 };
          items[currentIndex] = rebaseChangedValue(defaultProfile, incoming, items[currentIndex]);
        }
        continue;
      }
      if (strict && operation.before !== null) throw new Error("수정 대상이 삭제되었습니다. 미저장 내용을 확인해주세요.");
      const insertAt = Math.max(0, Math.min(operation.index ?? items.length, items.length));
      items.splice(insertAt, 0, operation.after);
    }
    (next[collection] as unknown[]) = items;
  }

  return next;
}

export function containsRecordChanges(server: AppData, pending: AppData, base: AppData): boolean {
  const operations = buildRecordOperations(base, pending);
  return operations.every(operation => {
    const current = (server[operation.collection] as unknown[]).find(item => recordIdentity(operation.collection, item) === operation.id) ?? null;
    return sameRecordValue(current, operation.after);
  });
}
