import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { deleteAttachmentFile } from "@/lib/fileStorage";
import { isValidDate, parseAmount, parsePurchaseFields } from "@/lib/purchase";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseHistory, loadPurchase, loadPurchaseView, placeInOrder } from "@/lib/purchaseStore";

type Params = { params: Promise<{ id: string }> };

// 수정
// - 구매요청·보류 건: 요청자 본인 또는 관리자가 요청 내용(부품명·수량·일정·예산·구입처·사용목적·긴급)을 고친다.
// - 발주 건: 관리자만 발주일·입고예정일·발주금액·구입처를 고친다. 입고예정일을 바꿀 때는 사유가 필요하다.
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const approver = isPurchaseApprover(req);

  if (row.status === "requested" || row.status === "on_hold") {
    if (!approver && actor !== row.requested_by) {
      return NextResponse.json({ error: "요청자 본인 또는 관리자만 고칠 수 있습니다." }, { status: 403 });
    }
    const parsed = parsePurchaseFields((k) => body[k]);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    db.transaction(() => {
      db.prepare(
        `UPDATE purchase_request SET part_name = ?, qty = ?, unit = ?, expected_date = ?, budget = ?, vendor = ?,
           purpose = ?, purpose_detail = ?, urgent = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(
        parsed.partName,
        parsed.qty,
        parsed.unit,
        parsed.expectedDate,
        parsed.budget,
        parsed.vendor,
        parsed.purpose,
        parsed.purposeDetail,
        parsed.urgent ? 1 : 0,
        id
      );
      // 긴급으로 새로 지정하면 1순위로 올린다.
      if (row.status === "requested" && parsed.urgent && !row.urgent) placeInOrder(db, row.id, true);
      addPurchaseHistory(db, id, actor, "요청 내용 수정");
    })();
  } else if (row.status === "ordered") {
    if (!approver) return NextResponse.json({ error: "발주 내용은 관리자만 고칠 수 있습니다." }, { status: 403 });
    const orderDate = body.order_date ?? row.order_date;
    const eta = body.eta ?? row.eta;
    if (!isValidDate(orderDate) || !isValidDate(eta)) {
      return NextResponse.json({ error: "발주일·입고예정일이 올바르지 않습니다." }, { status: 400 });
    }
    const amount = body.order_amount !== undefined ? parseAmount(body.order_amount) : row.order_amount;
    if (amount === null) return NextResponse.json({ error: "발주금액이 올바르지 않습니다." }, { status: 400 });
    const vendor = body.vendor !== undefined ? String(body.vendor).trim().slice(0, 60) || null : row.vendor;
    const reason = String(body.reason ?? "").trim().slice(0, 200);
    if (eta !== row.eta && !reason) {
      return NextResponse.json({ error: "입고예정일을 바꾸는 사유를 입력해주세요." }, { status: 400 });
    }
    db.transaction(() => {
      db.prepare(
        `UPDATE purchase_request SET order_date = ?, eta = ?, order_amount = ?, vendor = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(orderDate, eta, amount, vendor, id);
      const changes: string[] = [];
      if (eta !== row.eta) changes.push(`입고예정일 ${row.eta ?? "-"} → ${eta} (${reason})`);
      if (orderDate !== row.order_date) changes.push(`발주일 ${row.order_date ?? "-"} → ${orderDate}`);
      if (amount !== row.order_amount) {
        changes.push(`발주금액 ${Math.round(row.order_amount ?? 0).toLocaleString("ko-KR")} → ${Math.round(amount ?? 0).toLocaleString("ko-KR")}원`);
      }
      if (vendor !== row.vendor) changes.push(`구입처 ${row.vendor ?? "-"} → ${vendor ?? "-"}`);
      if (changes.length) addPurchaseHistory(db, id, actor, `발주 내용 변경: ${changes.join(", ")}`);
    })();
  } else {
    return NextResponse.json({ error: "입고완료·반려된 건은 고칠 수 없습니다." }, { status: 409 });
  }

  logAudit("purchase_request", row.part_name, "update", actor);
  return NextResponse.json(loadPurchaseView(db, id));
}

// 삭제: 승인 전(구매요청·보류·반려) 건은 요청자 본인 또는 관리자, 발주 이후 건은 관리자만.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const approver = isPurchaseApprover(req);
  const beforeOrder = row.status === "requested" || row.status === "on_hold" || row.status === "rejected";
  if (!approver && !(beforeOrder && actor === row.requested_by)) {
    return NextResponse.json({ error: "삭제 권한이 없습니다. (승인 전 본인 요청 또는 관리자)" }, { status: 403 });
  }
  const files = db.prepare("SELECT file_path FROM purchase_attachment WHERE request_id = ?").all(id) as {
    file_path: string;
  }[];
  db.transaction(() => {
    db.prepare("DELETE FROM purchase_attachment WHERE request_id = ?").run(id);
    db.prepare("DELETE FROM purchase_comment WHERE request_id = ?").run(id);
    db.prepare("DELETE FROM purchase_request WHERE id = ?").run(id);
  })();
  for (const f of files) deleteAttachmentFile(f.file_path);
  logAudit("purchase_request", row.part_name, "delete", actor);
  return NextResponse.json({ ok: true });
}
