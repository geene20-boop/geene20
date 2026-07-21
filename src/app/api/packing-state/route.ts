import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  PackingItem,
  PackingEntry,
  PackingRestock,
  PackingBreakage,
  PackingReturn,
  PackingAdjustment,
} from "@/lib/types";

// 재고현황 화면이 한 번의 요청으로 로드되도록 묶어서 제공 (최근 30일치 내역)
export async function GET() {
  const db = getDb();
  const since = "date('now', '-30 days')";

  const stock = db.prepare("SELECT * FROM packing_item ORDER BY kind, category, sub").all() as PackingItem[];
  const entries = db
    .prepare(`SELECT * FROM packing_entry WHERE date >= ${since} ORDER BY date DESC, created_at DESC`)
    .all() as PackingEntry[];
  const restocks = db
    .prepare(`SELECT * FROM packing_restock WHERE date >= ${since} ORDER BY date DESC, created_at DESC`)
    .all() as PackingRestock[];
  const breakages = db
    .prepare(`SELECT * FROM packing_breakage WHERE date >= ${since} ORDER BY date DESC, created_at DESC`)
    .all() as PackingBreakage[];
  const returns = db
    .prepare(`SELECT * FROM packing_return WHERE date >= ${since} ORDER BY date DESC, created_at DESC`)
    .all() as PackingReturn[];
  const adjustments = db
    .prepare(`SELECT * FROM packing_adjustment WHERE date >= ${since} ORDER BY date DESC, created_at DESC`)
    .all() as PackingAdjustment[];

  return NextResponse.json({ stock, entries, restocks, breakages, returns, adjustments });
}
