import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addDays } from "@/lib/purchase";
import { purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseComment, addPurchaseHistory, loadPurchase, loadPurchaseView, placeInOrder } from "@/lib/purchaseStore";

// 재요청: 입고완료된 소모품을 같은 품목·구입처·지난 발주금액으로 새 구매요청을 만든다 (맨 아래 순위).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "등록은 입력 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const src = loadPurchase(db, id);
  if (!src) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (src.status !== "received") return NextResponse.json({ error: "입고완료된 건만 재요청할 수 있습니다." }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const newId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO purchase_request
          (part_name, qty, unit, expected_date, budget, vendor, purpose, purpose_detail, urgent, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(
        src.part_name,
        src.qty,
        src.unit,
        addDays(today, 21),
        src.order_amount ?? src.budget,
        src.vendor,
        src.purpose,
        src.purpose_detail,
        actor
      );
    const nid = Number(info.lastInsertRowid);
    placeInOrder(db, nid, false);
    addPurchaseHistory(db, nid, actor, "재요청 등록");
    addPurchaseComment(
      db,
      nid,
      actor,
      "요청자",
      `지난 구매(${src.received_date ?? ""} 입고, ${Math.round(src.order_amount ?? 0).toLocaleString("ko-KR")}원) 기준 재요청`
    );
    return nid;
  })();
  logAudit("purchase_request", src.part_name, "create", actor, "재요청");
  return NextResponse.json(loadPurchaseView(db, newId), { status: 201 });
}
