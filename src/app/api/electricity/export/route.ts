import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ElectricityUsage } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM electricity_usage WHERE date BETWEEN ? AND ? ORDER BY date, plant")
    .all(from, to) as ElectricityUsage[];

  const sheetRows = rows.map((r) => ({
    날짜: r.date,
    공장: r.plant,
    전압구분: r.voltage_type,
    "사용량(kWh)": r.usage_kwh ?? "",
    입력방식: r.source === "api" ? "자동(API)" : "수동입력",
    비고: r.note ?? "",
  }));

  const buffer = buildXlsxBuffer(sheetRows, "전력사용량");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`전력사용량_${from}_${to}.xlsx`),
  });
}
