import { NextResponse } from "next/server";
import { backupCurrentState, isStoreFailure } from "../../lib/record-state";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" },
    { status: 503 },
  );
}

async function runBackup(force = false) {
  const result = await backupCurrentState(force);
  if (!result) return unavailable();
  if (isStoreFailure(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function GET() {
  return runBackup(false);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  return runBackup(body.force === true);
}
