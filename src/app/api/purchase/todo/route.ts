import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPurchaseApprover } from "@/lib/purchaseAuth";
import { countPurchaseTodo } from "@/lib/purchaseStore";

// 메뉴 [구매발주] 옆에 표시할 숫자: 관리자에게는 승인 대기 건수
export async function GET(req: NextRequest) {
  return NextResponse.json({ count: countPurchaseTodo(getDb(), isPurchaseApprover(req)) });
}
