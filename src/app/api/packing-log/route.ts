import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { fetchPackingLogCsv, parsePackingLogCsv, summarizePackingLog } from "@/lib/packingLog";

export const PACKING_LOG_CSV_URL_KEY = "packing_log_csv_url";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date는 필수입니다." }, { status: 400 });
  }

  const csvUrl = getSetting(PACKING_LOG_CSV_URL_KEY);
  if (!csvUrl) {
    return NextResponse.json({ configured: false });
  }

  try {
    const csvText = await fetchPackingLogCsv(csvUrl);
    const rows = parsePackingLogCsv(csvText);
    const summary = summarizePackingLog(rows, date);
    return NextResponse.json({ configured: true, ...summary });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 });
  }
}
