import { NextRequest, NextResponse } from "next/server";
import { getMergedRows, getMonthlySummary } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const month = searchParams.get("month");

  const rows = getMergedRows(from, to);
  const summary = month ? getMonthlySummary(month) : null;

  return NextResponse.json({ rows, summary });
}
