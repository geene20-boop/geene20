import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { SelfTestCertificate } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM self_test_certificate WHERE id = ?").get(id) as
    | SelfTestCertificate
    | undefined;
  if (!row) return NextResponse.json({ error: "발행 이력을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT item_name FROM self_test_certificate WHERE id = ?").get(id) as
    | { item_name: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "발행 이력을 찾을 수 없습니다." }, { status: 404 });

  db.prepare("DELETE FROM self_test_certificate WHERE id = ?").run(id);
  logAudit("self_test_certificate", row.item_name, "delete", getAdminName(req) ?? "관리자");
  return NextResponse.json({ ok: true });
}
