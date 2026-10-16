import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialSupplier } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const before = db.prepare("SELECT * FROM raw_material_supplier WHERE id = ?").get(id) as
    | RawMaterialSupplier
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "존재하지 않는 거래처입니다." }, { status: 404 });
  }

  const name = body.name !== undefined && body.name !== "" ? body.name : before.name;
  const address = body.address !== undefined ? body.address || null : before.address;
  const phone = body.phone !== undefined ? body.phone || null : before.phone;
  const country = body.country !== undefined ? body.country || null : before.country;

  db.prepare(
    "UPDATE raw_material_supplier SET name = ?, address = ?, phone = ?, country = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, address, phone, country, id);

  logAudit("raw_material_supplier", name, "update", actor, [address, phone].filter(Boolean).join(" / "));

  const row = db.prepare("SELECT * FROM raw_material_supplier WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const before = db.prepare("SELECT * FROM raw_material_supplier WHERE id = ?").get(id) as
    | RawMaterialSupplier
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "존재하지 않는 거래처입니다." }, { status: 404 });
  }
  const used = db
    .prepare("SELECT COUNT(*) as c FROM raw_material_inbound WHERE supplier_id = ?")
    .get(id) as { c: number };
  if (used.c > 0) {
    return NextResponse.json(
      { error: "입고 기록에서 사용 중인 거래처는 삭제할 수 없습니다." },
      { status: 400 }
    );
  }

  db.prepare("DELETE FROM raw_material_supplier WHERE id = ?").run(id);
  logAudit("raw_material_supplier", before.name, "delete", actor, "삭제됨");
  return NextResponse.json({ ok: true });
}
