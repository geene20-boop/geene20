import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logAudit, requireActor } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }
  const existing = db.prepare("SELECT date, plant FROM electricity_usage WHERE id = ?").get(id) as
    | { date: string; plant: string }
    | undefined;
  db.prepare("DELETE FROM electricity_usage WHERE id = ?").run(id);
  if (existing) {
    logAudit("electricity_usage", `${existing.date} ${existing.plant}`, "delete", actor);
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const usageKwh = typeof body.usage_kwh === "number" ? body.usage_kwh : null;
  const note = body.note ?? null;

  const existing = db.prepare("SELECT entered_by, date, plant FROM electricity_usage WHERE id = ?").get(id) as
    | { entered_by: string | null; date: string; plant: string }
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  db.prepare(
    `UPDATE electricity_usage
     SET usage_kwh = ?, note = ?, updated_by = ?, entered_by = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(usageKwh, note, actor, existing.entered_by ?? actor, id);

  logAudit("electricity_usage", `${existing.date} ${existing.plant}`, "update", actor);
  const row = db.prepare("SELECT * FROM electricity_usage WHERE id = ?").get(id);
  return NextResponse.json(row);
}
