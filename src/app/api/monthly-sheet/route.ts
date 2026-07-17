import { NextRequest, NextResponse } from "next/server";
import { getMonthlyDailySheet } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month는 필수입니다 (YYYY-MM)." }, { status: 400 });

  const rows = getMonthlyDailySheet(month);
  return NextResponse.json({ month, rows });
}
