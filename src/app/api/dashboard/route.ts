import { NextRequest, NextResponse } from "next/server";
import { getMergedRows, getMonthlySummary } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getDailyProduction } from "@/lib/packingProductionSummary";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const month = searchParams.get("month");

  const rows = getMergedRows(from, to);
  const summary = month ? getMonthlySummary(month) : null;
  // 포장량은 생산일지 수기입력(daily_pack_amount)이 아니라 제품포장(생산/출하 입력)에
  // 실제 기록된 실적을 근거로 삼는다 (월별요약 등 다른 화면과 동일한 기준).
  const packAmountTotal = getDailyProduction(getDb(), from, to).reduce((s, r) => s + r.tons, 0);

  return NextResponse.json({ rows, summary, packAmountTotal });
}
