import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM production_log WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const allowed = [
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
  ];
  const cols = allowed.filter((c) => body[c] !== undefined);
  if (cols.length === 0) return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });

  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => body[c] ?? null);

  db.prepare(`UPDATE production_log SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    id
  );
  const row = db.prepare("SELECT * FROM production_log WHERE id = ?").get(id);
  return NextResponse.json(row);
}
