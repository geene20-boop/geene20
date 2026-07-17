import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ProductionLog } from "@/lib/types";

const COLUMNS = [
  "date",
  "shift",
  "product",
  "daily_pack_amount",
  "dryer_temp_a",
  "dryer_temp_b",
  "feed_hopper_a",
  "feed_hopper_b",
  "feed_fine_powder",
  "feed_mixer",
  "feed_molder",
  "feed_total",
  "brix",
  "line_hours_a",
  "line_hours_b",
  "line_hours_total",
  "lng_dryer",
  "lng_rto",
  "gas_usage_shift",
  "gas_usage_total",
  "moisture_manual",
  "hardness_manual",
  "note",
] as const;

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM production_log WHERE date BETWEEN ? AND ? ORDER BY date DESC, shift ASC")
    .all(from, to) as ProductionLog[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  if (!body.date || !body.shift) {
    return NextResponse.json({ error: "date, shift는 필수입니다." }, { status: 400 });
  }

  const cols = COLUMNS.filter((c) => body[c] !== undefined);
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) => body[c] ?? null);

  try {
    const stmt = db.prepare(
      `INSERT INTO production_log (${cols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(date, shift) DO UPDATE SET
       ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = datetime('now')`
    );
    const info = stmt.run(...values);
    const row = db
      .prepare("SELECT * FROM production_log WHERE date = ? AND shift = ?")
      .get(body.date, body.shift);
    return NextResponse.json(row, { status: info.changes ? 201 : 200 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
