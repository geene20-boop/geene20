import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDailyLog } from "@/lib/packingDailyLog";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date는 필수입니다." }, { status: 400 });
  }
  const db = getDb();
  const result = getDailyLog(db, date);
  return NextResponse.json(result);
}
