import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isValidDate } from "@/lib/purchase";
import { purchaseActor, savePurchaseFiles } from "@/lib/purchaseAuth";
import { addPurchaseAttachment, addPurchaseComment, addPurchaseHistory, loadPurchase, loadPurchaseView } from "@/lib/purchaseStore";

// 입고확인 (입력 권한 이상 누구나). 받은 수량이 발주 수량에 못 미치면 부분입고로 기록하고 발주 단계에 남긴다.
// form: received_qty, received_date, memo?, photo?(납품 사진 여러 장)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "입고확인은 입력 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "ordered") return NextResponse.json({ error: "발주된 건만 입고확인할 수 있습니다." }, { status: 409 });

  const form = await req.formData();
  const left = row.qty - row.received_qty;
  const qty = Number(String(form.get("received_qty") ?? "").replace(/,/g, ""));
  if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "받은 수량을 입력해주세요." }, { status: 400 });
  if (qty > left + 1e-9) {
    return NextResponse.json({ error: `남은 수량(${left} ${row.unit})보다 많이 입력했습니다.` }, { status: 400 });
  }
  const date = String(form.get("received_date") ?? "");
  if (!isValidDate(date)) return NextResponse.json({ error: "입고일이 올바르지 않습니다." }, { status: 400 });
  const memo = String(form.get("memo") ?? "").trim().slice(0, 500);
  const actor = purchaseActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const files = form.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  const saved = await savePurchaseFiles(files);
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });

  const total = row.received_qty + qty;
  const done = total >= row.qty - 1e-9;
  db.transaction(() => {
    db.prepare(
      `UPDATE purchase_request SET received_qty = ?, status = ?, received_date = ?, received_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(done ? row.qty : total, done ? "received" : "ordered", done ? date : null, done ? actor : null, id);
    for (const s of saved) addPurchaseAttachment(db, id, "delivery", s.name, s.path, s.mime, actor);
    addPurchaseHistory(db, id, actor, done ? `입고완료 (${date})` : `부분입고 ${total}/${row.qty} ${row.unit} (${date})`);
    if (memo) addPurchaseComment(db, id, actor, null, `[입고 메모] ${memo}`);
  })();
  logAudit("purchase_request", row.part_name, "update", actor, done ? "입고완료" : "부분입고");
  return NextResponse.json(loadPurchaseView(db, id));
}
