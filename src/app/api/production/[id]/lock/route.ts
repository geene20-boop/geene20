import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { logAudit, requireActor } from "@/lib/audit";

// 확정(잠금)/해제. 확정은 편집 권한만 있으면 되지만, 해제는 관리자 로그인이 필요하다
// (실수로 덮어쓰는 걸 막기 위한 기능이므로, 해제도 아무나 할 수 있으면 의미가 없다).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const locked = !!body.locked;
  if (!locked && !isAdminRequest(req)) {
    return NextResponse.json({ error: "확정 해제는 관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const existing = db.prepare("SELECT date, shift FROM production_log WHERE id = ?").get(id) as
    | { date: string; shift: string }
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  db.prepare("UPDATE production_log SET locked = ?, updated_at = datetime('now') WHERE id = ?").run(
    locked ? 1 : 0,
    id
  );
  logAudit("production_log", `${existing.date} ${existing.shift}조`, "update", actor, locked ? "확정" : "확정 해제");

  const row = db.prepare("SELECT * FROM production_log WHERE id = ?").get(id);
  return NextResponse.json(row);
}
