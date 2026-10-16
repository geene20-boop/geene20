import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isValidDate, parseAmount } from "@/lib/purchase";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseComment, addPurchaseHistory, loadPurchase, loadPurchaseViews, requestedOrder, writeOrder } from "@/lib/purchaseStore";
import { PurchaseRequest } from "@/lib/types";

// 관리자 승인 → 발주. 한 건 또는 여러 건(일괄 승인)을 한 번에 처리한다.
// body: { ids: number[], order_date, eta, order_amount?(한 건일 때만), vendor?(한 건일 때만), comment? }
// 일괄 승인 시 발주금액은 각 건의 예산으로 채우고, 나중에 발주 탭에서 고칠 수 있다.
export async function POST(req: NextRequest) {
  if (!isPurchaseApprover(req)) {
    return NextResponse.json({ error: "승인은 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return NextResponse.json({ error: "승인할 요청을 선택해주세요." }, { status: 400 });
  if (!isValidDate(body.order_date) || !isValidDate(body.eta)) {
    return NextResponse.json({ error: "발주일과 입고 예상일을 입력해주세요." }, { status: 400 });
  }
  if (body.eta < body.order_date) {
    return NextResponse.json({ error: "입고 예상일이 발주일보다 빠릅니다." }, { status: 400 });
  }
  const single = ids.length === 1;
  const amount = single && body.order_amount !== undefined ? parseAmount(body.order_amount) : undefined;
  if (amount === null) return NextResponse.json({ error: "발주금액이 올바르지 않습니다." }, { status: 400 });
  const comment = String(body.comment ?? "").trim().slice(0, 1000);
  const actor = purchaseActor(req, body) ?? "관리자";

  const db = getDb();
  const rows = ids.map((id) => loadPurchase(db, id)).filter((r): r is PurchaseRequest => !!r);
  if (rows.length !== ids.length || rows.some((r) => r.status !== "requested")) {
    return NextResponse.json({ error: "승인 대기 중인 요청만 승인할 수 있습니다. 화면을 새로고침해주세요." }, { status: 409 });
  }

  db.transaction(() => {
    const upd = db.prepare(
      `UPDATE purchase_request SET status = 'ordered', approved_by = ?, approved_at = datetime('now'),
         order_date = ?, eta = ?, order_amount = ?, vendor = ?, received_qty = 0, updated_at = datetime('now')
       WHERE id = ?`
    );
    for (const r of rows) {
      const vendor = single && body.vendor !== undefined ? String(body.vendor).trim().slice(0, 60) || null : r.vendor;
      upd.run(actor, body.order_date, body.eta, amount ?? r.budget, vendor, r.id);
      addPurchaseHistory(db, r.id, actor, `${single ? "승인" : "일괄 승인"} · 발주 (입고예정 ${body.eta})`);
      if (comment) addPurchaseComment(db, r.id, actor, "승인자", comment);
    }
    writeOrder(db, requestedOrder(db));
  })();

  for (const r of rows) logAudit("purchase_request", r.part_name, "update", actor, "승인·발주");
  return NextResponse.json(loadPurchaseViews(db));
}
