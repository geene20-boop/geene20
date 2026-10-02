import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getImprovementPlanActorName, isImprovementPlanAdminRequest } from "@/lib/auth";
import { countTodo } from "@/lib/improvementPlanStore";

// 메뉴 옆에 표시할 "내가 처리할 개선계획" 건수.
// 승인 권한자: 승인대기 건수 / 그 외: 내가 담당인 재검토 건 + 기한 초과된 진행 건
export async function GET(req: NextRequest) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 시간 기준
  const count = countTodo(getDb(), isImprovementPlanAdminRequest(req), getImprovementPlanActorName(req), today);
  return NextResponse.json({ count });
}
