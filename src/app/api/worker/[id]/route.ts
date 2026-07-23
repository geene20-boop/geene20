import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { Worker } from "@/lib/types";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM worker WHERE id = ?").get(id) as Worker | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 근로자입니다." }, { status: 404 });
  }
  db.prepare("UPDATE worker SET active = 0 WHERE id = ?").run(id);
  logAudit("worker", existing.name, "delete", "관리자");
  return NextResponse.json({ ok: true });
}
