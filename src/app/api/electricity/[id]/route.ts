import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM electricity_usage WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const usageKwh = typeof body.usage_kwh === "number" ? body.usage_kwh : null;
  const note = body.note ?? null;

  db.prepare(
    "UPDATE electricity_usage SET usage_kwh = ?, note = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(usageKwh, note, id);

  const row = db.prepare("SELECT * FROM electricity_usage WHERE id = ?").get(id);
  return NextResponse.json(row);
}
