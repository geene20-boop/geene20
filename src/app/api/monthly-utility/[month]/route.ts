import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { month } = await params;
  const db = getDb();
  db.prepare("DELETE FROM monthly_utility WHERE month = ?").run(month);
  return NextResponse.json({ ok: true });
}
