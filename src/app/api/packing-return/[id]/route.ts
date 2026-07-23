import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord } from "@/lib/auth";
import { PackingReturn } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { adjustStock, packingItemAuditLabel, runInTransaction } from "@/lib/packingStock";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare("SELECT * FROM packing_return WHERE id = ?").get(id) as
    | PackingReturn
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 반품 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  runInTransaction((db) => {
    adjustStock(db, before.key, -before.qty);
    db.prepare("DELETE FROM packing_return WHERE id = ?").run(id);
  });

  logAudit("packing_return", `${before.date} ${packingItemAuditLabel(db, before.key)}`, "delete", actor, "삭제됨(재고 원복)");
  return NextResponse.json({ ok: true });
}
