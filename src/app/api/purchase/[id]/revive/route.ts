import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseHistory, loadPurchase, loadPurchaseView, placeInOrder } from "@/lib/purchaseStore";

// 반려·보류된 요청을 다시 구매요청(승인 대기)으로 올린다. 요청자 본인 또는 관리자. 맨 아래 순위로 들어간다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "rejected" && row.status !== "on_hold") {
    return NextResponse.json({ error: "반려·보류된 요청만 다시 요청할 수 있습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  if (!isPurchaseApprover(req) && actor !== row.requested_by) {
    return NextResponse.json({ error: "요청자 본인 또는 관리자만 다시 요청할 수 있습니다." }, { status: 403 });
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE purchase_request SET status = 'requested', requested_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    placeInOrder(db, row.id, !!row.urgent);
    addPurchaseHistory(db, id, actor, "다시 요청");
  })();
  return NextResponse.json(loadPurchaseView(db, id));
}
