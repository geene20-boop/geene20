import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDailyProduction, getMonthlyProduction, getSeasonProduction } from "@/lib/packingProductionSummary";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? daysAgo(30);
  const to = searchParams.get("to") ?? today();
  return NextResponse.json({
    daily: getDailyProduction(db, from, to),
    monthly: getMonthlyProduction(db),
    seasonal: getSeasonProduction(db),
  });
}
