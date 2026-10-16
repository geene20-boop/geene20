import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { moveToPosition } from "@/lib/improvementPlan";
import { isPurchaseApprover } from "@/lib/purchaseAuth";
import { loadPurchase, loadPurchaseViews, requestedOrder, writeOrder } from "@/lib/purchaseStore";

// 구매요청 목록에서 순위를 바꾼다 (관리자만).
// - { position: n }: n위로 바로 이동 (순위 숫자 입력·끌어서 놓기·맨 위로/맨 아래로)
// - { direction: "up" | "down" }: 한 칸 위/아래 (▲▼)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isPurchaseApprover(req)) {
    return NextResponse.json({ error: "순위 변경은 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPurchase(db, id);
  if (!row) return NextResponse.json({ error: "구매요청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "requested") {
    return NextResponse.json({ error: "승인 대기 중인 요청만 순위를 바꿀 수 있습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const ordered = requestedOrder(db);
  const current = ordered.indexOf(row.id) + 1;

  let target: number;
  if (body.position !== undefined) {
    const n = Number(body.position);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "순위는 1 이상의 숫자로 입력해주세요." }, { status: 400 });
    }
    target = Math.min(n, ordered.length);
  } else if (body.direction === "up" || body.direction === "down") {
    target = body.direction === "up" ? current - 1 : current + 1;
    if (target < 1 || target > ordered.length) {
      return NextResponse.json({ error: "더 이상 이동할 수 없습니다." }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: "position 또는 direction(up/down)이 필요합니다." }, { status: 400 });
  }

  if (target !== current) {
    db.transaction(() => writeOrder(db, moveToPosition(ordered, row.id, target)))();
  }
  return NextResponse.json(loadPurchaseViews(db));
}
