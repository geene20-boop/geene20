import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ElectricityUsage, Plant, PLANT_VOLTAGE } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM electricity_usage WHERE date BETWEEN ? AND ? ORDER BY date DESC, plant")
    .all(from, to) as ElectricityUsage[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const plant = body.plant as Plant;
  if (!body.date) {
    return NextResponse.json({ error: "date는 필수입니다." }, { status: 400 });
  }
  if (!plant || !(plant in PLANT_VOLTAGE)) {
    return NextResponse.json({ error: "plant는 '1공장' 또는 '2공장'이어야 합니다." }, { status: 400 });
  }

  const actor = requireActor(body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const voltageType = PLANT_VOLTAGE[plant];
  const usageKwh = typeof body.usage_kwh === "number" ? body.usage_kwh : null;
  const note = body.note ?? null;

  const existing = db
    .prepare("SELECT id FROM electricity_usage WHERE date = ? AND plant = ?")
    .get(body.date, plant);

  db.prepare(
    `INSERT INTO electricity_usage (date, plant, voltage_type, usage_kwh, source, note, entered_by, updated_by)
     VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)
     ON CONFLICT(date, plant) DO UPDATE SET
       usage_kwh = excluded.usage_kwh,
       voltage_type = excluded.voltage_type,
       note = excluded.note,
       updated_by = excluded.updated_by,
       entered_by = COALESCE(electricity_usage.entered_by, excluded.entered_by),
       updated_at = datetime('now')`
  ).run(body.date, plant, voltageType, usageKwh, note, actor, actor);

  const row = db
    .prepare("SELECT * FROM electricity_usage WHERE date = ? AND plant = ?")
    .get(body.date, plant);
  logAudit(
    "electricity_usage",
    `${body.date} ${plant}`,
    existing ? "update" : "create",
    actor,
    usageKwh != null ? `${usageKwh}kWh` : undefined
  );
  return NextResponse.json(row, { status: 201 });
}
