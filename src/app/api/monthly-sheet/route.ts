import { NextRequest, NextResponse } from "next/server";
import { getMonthlyDailySheet } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const rows = getMonthlyDailySheet(month);
  return NextResponse.json({ month, rows });
}
