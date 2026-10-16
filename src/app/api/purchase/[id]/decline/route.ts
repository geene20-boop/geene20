import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";
import {
  addPurchaseComment,
  addPurchaseHistory,
  loadPurchase,
  loadPurchaseView,
  requestedOrder,
  writeOrder,
} from "@/lib/purchaseStore";

// 반려(진행 안 함) 또는 보류(나중에 다시 검토). 관리자만, 사유(승인자 의견)를 반드시 적는다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isPurchaseApprover(req)) {
    return NextResponse.json({ error: "반려·보류는 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "requested") {
    return NextResponse.json({ error: "승인 대기 중인 요청만 반려·보류할 수 있습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "반려" ? "반려" : body.kind === "보류" ? "보류" : null;
  if (!kind) return NextResponse.json({ error: "반려 또는 보류를 선택해주세요." }, { status: 400 });
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  if (!reason) return NextResponse.json({ error: "사유를 입력해주세요." }, { status: 400 });
  const actor = purchaseActor(req, body) ?? "관리자";

  db.transaction(() => {
    db.prepare(
      `UPDATE purchase_request SET status = ?, decline_reason = ?, declined_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(kind === "반려" ? "rejected" : "on_hold", reason, actor, id);
    addPurchaseHistory(db, id, actor, kind);
    addPurchaseComment(db, id, actor, "승인자", `[${kind}] ${reason}`);
    writeOrder(db, requestedOrder(db));
  })();
  logAudit("purchase_request", row.part_name, "update", actor, kind);
  return NextResponse.json(loadPurchaseView(db, id));
}
