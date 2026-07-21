import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { PackingBreakage } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { adjustStock, runInTransaction } from "@/lib/packingStock";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "파손 수량 수정은 관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  if (typeof body.qty !== "number") {
    return NextResponse.json({ error: "qty는 필수입니다." }, { status: 400 });
  }
  const actor = requireActor(body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare("SELECT * FROM packing_breakage WHERE id = ?").get(id) as
    | PackingBreakage
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 파손 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  const newQty = body.qty;
  const delta = newQty - before.qty; // 파포수량이 늘면(delta>0) 재고를 그만큼 더 차감

  runInTransaction((db) => {
    adjustStock(db, before.key, -delta);
    db.prepare(
      "UPDATE packing_breakage SET qty = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newQty, actor, id);
  });

  logAudit(
    "packing_breakage",
    `${before.date} ${before.key}`,
    "update",
    actor,
    `이전: ${before.qty} → 이후: ${newQty}`
  );

  const row = getDb().prepare("SELECT * FROM packing_breakage WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "파손 내역 삭제는 관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare("SELECT * FROM packing_breakage WHERE id = ?").get(id) as
    | PackingBreakage
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 파손 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  runInTransaction((db) => {
    adjustStock(db, before.key, before.qty);
    db.prepare("DELETE FROM packing_breakage WHERE id = ?").run(id);
  });

  logAudit("packing_breakage", `${before.date} ${before.key}`, "delete", actor, "삭제됨(재고 원복)");
  return NextResponse.json({ ok: true });
}
