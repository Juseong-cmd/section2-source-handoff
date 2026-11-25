import { NextResponse } from "next/server";
import type { AppData, AuditLog } from "../../data";
import {
  applyRecordChanges,
  createStateBackup,
  isStoreFailure,
  normalizeData,
  parseOperations,
  readCurrentState,
  type StateSnapshot,
} from "../../lib/record-state";
import { buildRecordOperations, commandCollections, rebaseRecordOperations, type RecordOperation } from "../../state-operations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_NORMAL_OPERATION_COUNT = 20;

function unavailable() {
  return NextResponse.json(
    { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" },
    { status: 503 },
  );
}

function stateResponse(state: StateSnapshot) {
  return NextResponse.json(state);
}

export async function GET(request: Request) {
  const calendarView = new URL(request.url).searchParams.get("view") === "calendar";
  const state = await readCurrentState({ withoutDrawings: calendarView });
  if (!state) return unavailable();
  if (isStoreFailure(state)) return NextResponse.json({ error: state.error }, { status: state.status });
  return stateResponse(state);
}

type SaveEnvelope = {
  data?: unknown;
  baseData?: unknown;
  updatedAt?: unknown;
  operations?: unknown;
  requestId?: unknown;
};

function requestIdFrom(request: Request, envelope: SaveEnvelope) {
  const candidate = typeof envelope.requestId === "string"
    ? envelope.requestId
    : request.headers.get("X-Request-ID") ?? "legacy";
  return candidate.slice(0, 120);
}

function actionFromOperations(operations: RecordOperation[]) {
  const operation = operations.find((item) => item.collection === "auditLogs" && item.after);
  const log = operation?.after as Partial<AuditLog> | undefined;
  return { actor: log?.actor ?? "미지정", action: log?.action ?? "데이터 동기화" };
}

function scopeOversizedOperations(operations: RecordOperation[], latest: AppData) {
  const auditOperations = operations
    .filter((item) => item.collection === "auditLogs" && item.after)
    .sort((left, right) => {
      const leftAt = (left.after as Partial<AuditLog>).at ?? "";
      const rightAt = (right.after as Partial<AuditLog>).at ?? "";
      return rightAt.localeCompare(leftAt);
    });
  const auditOperation = auditOperations[0];
  const log = auditOperation?.after as Partial<AuditLog> | undefined;
  if (!auditOperation || !log?.action || !log.actor) return null;

  const memberName = log.action.startsWith("팀원 수정:")
    ? log.action.slice("팀원 수정:".length).trim()
    : log.actor;
  const member = latest.members.find((item) => item.name === memberName);
  if (!member) return null;

  const allowed = new Set([`auditLogs:${auditOperation.id}`]);
  if (log.action.startsWith("팀원 수정:")) {
    allowed.add(`members:${member.id}`);
  } else if (log.action === "캐릭터 정보 이전" || log.action === "캐릭터 변경") {
    allowed.add(`characterProfiles:${member.id}`);
  } else if (log.action === "캐릭터 EXP 획득" || log.action === "드로잉 제출") {
    allowed.add(`characterProfiles:${member.id}`);
    for (const operation of operations) {
      if (operation.collection === "dailyCharacterExp" && operation.id.startsWith(`${member.id}|`)) {
        allowed.add(`dailyCharacterExp:${operation.id}`);
      }
      if (log.action === "드로잉 제출" && operation.collection === "drawingSubmissions" && operation.id === member.id) {
        allowed.add(`drawingSubmissions:${operation.id}`);
      }
    }
  } else {
    return null;
  }

  return operations.filter((operation) => allowed.has(`${operation.collection}:${operation.id}`));
}

async function saveState(request: Request) {
  const envelope = (await request.json().catch(() => null)) as SaveEnvelope | null;
  if (!envelope || typeof envelope !== "object") {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const latest = await readCurrentState();
  if (!latest) return unavailable();
  if (isStoreFailure(latest)) return NextResponse.json({ error: latest.error }, { status: latest.status });

  let operations: RecordOperation[];
  if ("operations" in envelope) {
    const parsed = parseOperations(envelope.operations);
    if (!parsed) return NextResponse.json({ error: "invalid record operations" }, { status: 400 });
    if (parsed.some(op => commandCollections.includes(op.collection))) {
      return NextResponse.json({ error: "Use the dedicated command endpoint for these records" }, { status: 400 });
    }
    operations = parsed;
  } else if ("data" in envelope) {
    const incoming = normalizeData(envelope.data);
    const base = envelope.baseData ? normalizeData(envelope.baseData) : latest.data;
    const expectedUpdatedAt = typeof envelope.updatedAt === "string" ? envelope.updatedAt : null;
    if (!envelope.baseData && expectedUpdatedAt && latest.updatedAt && expectedUpdatedAt !== latest.updatedAt) {
      return NextResponse.json({ error: "state conflict", current: latest }, { status: 409 });
    }
    // Legacy clients may omit new collections. Bay writes have their own validated endpoint.
    operations = buildRecordOperations(base, incoming).filter(op => !commandCollections.includes(op.collection));
  } else {
    return NextResponse.json({ error: "data or operations are required" }, { status: 400 });
  }

  operations = operations.filter(operation => operation.collection !== "auditLogs" || operation.after !== null);
  if (operations.length === 0) return stateResponse(latest);
  const originalOperationCount = operations.length;
  if (originalOperationCount > MAX_NORMAL_OPERATION_COUNT) {
    const scoped = scopeOversizedOperations(operations, latest.data);
    if (!scoped || scoped.length === 0) {
      console.warn("[state] oversized stale save rejected", JSON.stringify({ requestId: requestIdFrom(request, envelope), originalOperationCount }));
      return NextResponse.json({ error: "stale oversized save", current: latest }, { status: 409 });
    }
    const rebased = rebaseRecordOperations(latest.data, scoped);
    operations = buildRecordOperations(latest.data, rebased);
    console.warn("[state] oversized stale save scoped", JSON.stringify({
      requestId: requestIdFrom(request, envelope),
      originalOperationCount,
      scopedOperationCount: operations.length,
    }));
    if (operations.length === 0) return stateResponse(latest);
  }
  const requestId = requestIdFrom(request, envelope);
  const action = actionFromOperations(operations);
  console.info("[state] record save received", JSON.stringify({ requestId, ...action, operationCount: operations.length }));

  try {
    await createStateBackup(latest.data, latest.updatedAt, "before-record-write");
  } catch (error) {
    console.error("[state] backup failed before record write", error);
  }

  const result = await applyRecordChanges(operations, requestId);
  if (!result) return unavailable();
  if (isStoreFailure(result)) {
    console.error("[state] record save failed", JSON.stringify({ requestId, status: result.status, error: result.error }));
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if ("conflict" in result) {
    const current = await readCurrentState();
    console.warn("[state] record conflict", JSON.stringify({ requestId, ...action, ...result }));
    return NextResponse.json({ error: "record conflict", current, details: result }, { status: 409 });
  }

  console.info("[state] record save completed", JSON.stringify({ requestId, ...action, operationCount: operations.length }));
  return stateResponse(result);
}

export async function POST(request: Request) {
  return saveState(request);
}

export async function PUT(request: Request) {
  return saveState(request);
}
