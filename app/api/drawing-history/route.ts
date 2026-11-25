import { NextResponse } from "next/server";
import { listDrawingHistory } from "../../lib/drawing-history";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const memberId = params.get("memberId") ?? "";
  const offset = Number(params.get("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || memberId.length > 200) return NextResponse.json({error:"Invalid query"},{status:400});
  try {
    return NextResponse.json(await listDrawingHistory(memberId, offset), {headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"그림 이력을 불러오지 못했습니다."},{status:503}); }
}
