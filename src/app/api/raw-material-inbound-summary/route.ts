import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDailyInbound, getMonthlyInbound, getSeasonInbound, seasonKey } from "@/lib/rawMaterialInboundSummary";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const materialKey = searchParams.get("materialKey") || null;
  const day = searchParams.get("day") ?? today();
  const month = searchParams.get("month") ?? day.slice(0, 7);
  const season = searchParams.get("season") ?? seasonKey(day);

  return NextResponse.json({
    daily: getDailyInbound(db, day, 30, materialKey),
    monthly: getMonthlyInbound(db, month, 12, materialKey),
    seasonal: getSeasonInbound(db, season, 5, materialKey),
  });
}
