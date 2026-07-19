import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { month } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = typeof body?.entered_by === "string" && body.entered_by.trim() ? body.entered_by.trim() : "관리자";
  db.prepare("DELETE FROM monthly_utility WHERE month = ?").run(month);
  logAudit("monthly_utility", month, "delete", actor);
  return NextResponse.json({ ok: true });
}
