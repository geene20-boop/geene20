import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialSupplier } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM raw_material_supplier ORDER BY name").all() as RawMaterialSupplier[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "거래처명은 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare("SELECT id FROM raw_material_supplier WHERE name = ?").get(name);
  if (existing) {
    return NextResponse.json({ error: `이미 존재하는 거래처명입니다: ${name}` }, { status: 409 });
  }

  const info = db
    .prepare(
      "INSERT INTO raw_material_supplier (name, address, phone, entered_by) VALUES (?, ?, ?, ?)"
    )
    .run(name, body.address ?? null, body.phone ?? null, actor);

  logAudit("raw_material_supplier", name, "create", actor, [body.address, body.phone].filter(Boolean).join(" / "));

  const row = db.prepare("SELECT * FROM raw_material_supplier WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
