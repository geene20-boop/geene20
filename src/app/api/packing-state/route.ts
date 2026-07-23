import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  PackingItem,
  PackingEntry,
  PackingRestock,
  PackingBreakage,
  PackingReturn,
  PackingAdjustment,
} from "@/lib/types";

// 재고현황 화면이 한 번의 요청으로 로드되도록 묶어서 제공 (from~to 조회기간, 기본 최근 30일)
export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const fromExpr = from ? "?" : "date('now', '-30 days')";
  const toExpr = to ? "?" : "date('now')";
  const params = [...(from ? [from] : []), ...(to ? [to] : [])];

  const stock = db.prepare("SELECT * FROM packing_item ORDER BY kind, category, sub").all() as PackingItem[];
  const entries = db
    .prepare(`SELECT * FROM packing_entry WHERE date >= ${fromExpr} AND date <= ${toExpr} ORDER BY date DESC, created_at DESC`)
    .all(...params) as PackingEntry[];
  const restocks = db
    .prepare(`SELECT * FROM packing_restock WHERE date >= ${fromExpr} AND date <= ${toExpr} ORDER BY date DESC, created_at DESC`)
    .all(...params) as PackingRestock[];
  const breakages = db
    .prepare(`SELECT * FROM packing_breakage WHERE date >= ${fromExpr} AND date <= ${toExpr} ORDER BY date DESC, created_at DESC`)
    .all(...params) as PackingBreakage[];
  const returns = db
    .prepare(`SELECT * FROM packing_return WHERE date >= ${fromExpr} AND date <= ${toExpr} ORDER BY date DESC, created_at DESC`)
    .all(...params) as PackingReturn[];
  const adjustments = db
    .prepare(`SELECT * FROM packing_adjustment WHERE date >= ${fromExpr} AND date <= ${toExpr} ORDER BY date DESC, created_at DESC`)
    .all(...params) as PackingAdjustment[];

  return NextResponse.json({ stock, entries, restocks, breakages, returns, adjustments });
}
