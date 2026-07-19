import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ElectricityUsage } from "@/lib/types";

// 기간별 전력 사용량 조회 + 1공장/2공장/합계 집계 (req1)
export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";

  const rows = db
    .prepare("SELECT * FROM electricity_usage WHERE date BETWEEN ? AND ? ORDER BY date DESC, plant")
    .all(from, to) as ElectricityUsage[];

  let plant1 = 0;
  let plant2 = 0;
  let plant1Days = 0;
  let plant2Days = 0;
  for (const r of rows) {
    if (r.usage_kwh == null) continue;
    if (r.plant === "1공장") {
      plant1 += r.usage_kwh;
      plant1Days++;
    } else if (r.plant === "2공장") {
      plant2 += r.usage_kwh;
      plant2Days++;
    }
  }

  return NextResponse.json({
    from,
    to,
    rows,
    totals: {
      plant1: +plant1.toFixed(2),
      plant2: +plant2.toFixed(2),
      total: +(plant1 + plant2).toFixed(2),
      plant1Days,
      plant2Days,
    },
  });
}
