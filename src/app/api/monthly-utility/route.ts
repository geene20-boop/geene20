import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MonthlyUtility } from "@/lib/types";
import { isAdminRequest } from "@/lib/auth";
import { logAudit, requireActor } from "@/lib/audit";

const NUM_FIELDS = [
  "elec1_kwh",
  "elec1_won",
  "elec2_kwh",
  "elec2_won",
  "lng_m3",
  "lng_won",
  "diesel_liter",
  "diesel_won",
  "production_ton",
] as const;

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-00";
  const to = searchParams.get("to") ?? "9999-99";
  const rows = db
    .prepare("SELECT * FROM monthly_utility WHERE month BETWEEN ? AND ? ORDER BY month DESC")
    .all(from, to) as MonthlyUtility[];
  return NextResponse.json(rows);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const db = getDb();
  const body = await req.json();
  const month = String(body.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const values: Record<string, number | null> = {};
  for (const f of NUM_FIELDS) values[f] = numOrNull(body[f]);
  const note = body.note ?? null;

  const existing = db.prepare("SELECT month FROM monthly_utility WHERE month = ?").get(month);

  db.prepare(
    `INSERT INTO monthly_utility
       (month, elec1_kwh, elec1_won, elec2_kwh, elec2_won, lng_m3, lng_won, diesel_liter, diesel_won, production_ton, note, entered_by, updated_by)
     VALUES (@month, @elec1_kwh, @elec1_won, @elec2_kwh, @elec2_won, @lng_m3, @lng_won, @diesel_liter, @diesel_won, @production_ton, @note, @actor, @actor)
     ON CONFLICT(month) DO UPDATE SET
       elec1_kwh = excluded.elec1_kwh,
       elec1_won = excluded.elec1_won,
       elec2_kwh = excluded.elec2_kwh,
       elec2_won = excluded.elec2_won,
       lng_m3 = excluded.lng_m3,
       lng_won = excluded.lng_won,
       diesel_liter = excluded.diesel_liter,
       diesel_won = excluded.diesel_won,
       production_ton = excluded.production_ton,
       note = excluded.note,
       updated_by = excluded.updated_by,
       entered_by = COALESCE(monthly_utility.entered_by, excluded.entered_by),
       updated_at = datetime('now')`
  ).run({ month, ...values, note, actor });

  const row = db.prepare("SELECT * FROM monthly_utility WHERE month = ?").get(month);
  logAudit("monthly_utility", month, existing ? "update" : "create", actor);
  return NextResponse.json(row, { status: 201 });
}
