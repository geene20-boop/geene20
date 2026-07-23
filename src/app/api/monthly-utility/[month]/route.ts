import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord } from "@/lib/auth";
import { MonthlyUtility } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const before = db.prepare("SELECT * FROM monthly_utility WHERE month = ?").get(month) as
    | MonthlyUtility
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  db.prepare("DELETE FROM monthly_utility WHERE month = ?").run(month);
  logAudit("monthly_utility", month, "delete", actor);
  return NextResponse.json({ ok: true });
}
