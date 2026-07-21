import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMonthlyProduction, getSeasonProduction } from "@/lib/packingProductionSummary";

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    monthly: getMonthlyProduction(db),
    seasonal: getSeasonProduction(db),
  });
}
