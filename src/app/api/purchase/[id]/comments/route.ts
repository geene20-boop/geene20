import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseComment, loadPurchase } from "@/lib/purchaseStore";
import { PurchaseComment } from "@/lib/types";

// 의견(요청자·승인자 대화)과 진행 이력을 시간순으로 돌려준다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = getDb()
    .prepare("SELECT * FROM purchase_comment WHERE request_id = ? ORDER BY id ASC")
    .all(id) as PurchaseComment[];
  return NextResponse.json(rows);
}

// 관리자가 쓰면 '승인자' 의견, 요청자 본인이 쓰면 '요청자' 의견으로 표시된다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "의견 작성은 입력 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
  if (!text) return NextResponse.json({ error: "의견 내용을 입력해주세요." }, { status: 400 });
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const role = isPurchaseApprover(req) ? "승인자" : actor === row.requested_by ? "요청자" : null;
  const newId = addPurchaseComment(db, id, actor, role, text);
  db.prepare("UPDATE purchase_request SET updated_at = datetime('now') WHERE id = ?").run(id);
  return NextResponse.json(db.prepare("SELECT * FROM purchase_comment WHERE id = ?").get(newId), { status: 201 });
}
