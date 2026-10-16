import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPurchaseApprover, purchaseActor } from "@/lib/purchaseAuth";

// 의견 삭제: 본인이 쓴 의견만 (관리자는 모두). 진행 이력은 지울 수 없다.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT id, author, kind FROM purchase_comment WHERE id = ? AND request_id = ?")
    .get(commentId, id) as { id: number; author: string; kind: string } | undefined;
  if (!row || row.kind !== "comment") return NextResponse.json({ error: "의견을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!isPurchaseApprover(req) && actor !== row.author) {
    return NextResponse.json({ error: "본인이 쓴 의견만 삭제할 수 있습니다." }, { status: 403 });
  }
  db.prepare("DELETE FROM purchase_comment WHERE id = ?").run(row.id);
  return NextResponse.json({ ok: true });
}
