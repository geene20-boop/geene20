import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { purchaseActor } from "@/lib/purchaseAuth";
import { addPurchaseHistory, loadPurchase, loadPurchaseView } from "@/lib/purchaseStore";

// 입고완료 건을 카톡으로 공유했다고 기록한다 (입고 탭의 '공유됨' 표시).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "received") return NextResponse.json({ error: "입고완료된 건만 공유할 수 있습니다." }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const actor = purchaseActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  db.transaction(() => {
    db.prepare(
      `UPDATE purchase_request SET kakao_shared_at = datetime('now'), kakao_shared_by = ? WHERE id = ?`
    ).run(actor, id);
    addPurchaseHistory(db, id, actor, "카톡 공유 (생산부장)");
  })();
  return NextResponse.json(loadPurchaseView(db, id));
}
