import { NextRequest, NextResponse } from "next/server";
import { getUtilityMonthlySheet, getUtilityYearlySummary, getUtilityYoY, monthsInRange } from "@/lib/analytics";

// 월별 유틸리티 통합 시트 + 전년동월 대비(YoY)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: "from, to는 YYYY-MM 형식이어야 합니다." },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "from은 to보다 이후일 수 없습니다." }, { status: 400 });
  }

  const months = monthsInRange(from, to);
  if (months.length > 60) {
    return NextResponse.json({ error: "조회 기간은 최대 60개월입니다." }, { status: 400 });
  }

  const sheet = getUtilityMonthlySheet(months);
  const yoy = getUtilityYoY(months);
  const years = Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort();
  const yearly = getUtilityYearlySummary(years);
  return NextResponse.json({ from, to, months, sheet, yoy, yearly });
}
