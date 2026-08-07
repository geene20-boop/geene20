import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord, canEditRecord } from "@/lib/auth";
import { RawMaterial } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const db = getDb();
  const body = await req.json();

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const before = db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key) as
    | RawMaterial
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 원재료를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canEditRecord(req, before)) {
    const reason = before.locked
      ? "승인된 원재료는 수정할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "수정 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const name = body.name !== undefined && body.name !== "" ? body.name : before.name;
  const form = body.form !== undefined && body.form !== "" ? body.form : before.form;
  const category = body.category !== undefined && body.category !== "" ? body.category : before.category;
  const unit = body.unit !== undefined && body.unit !== "" ? body.unit : before.unit;
  const submitTo = body.submitTo !== undefined ? body.submitTo || null : before.submit_to;
  const stock = typeof body.stock === "number" ? body.stock : before.stock;

  db.prepare(
    "UPDATE raw_material SET name = ?, form = ?, category = ?, unit = ?, submit_to = ?, stock = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?"
  ).run(name, form, category, unit, submitTo, stock, actor, key);

  logAudit(
    "raw_material",
    `[${key}] ${name}`,
    "update",
    actor,
    `이전: ${before.name}/${before.form}/${before.unit}/${before.stock} → 이후: ${name}/${form}/${unit}/${stock}`
  );

  const row = db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key);
  return NextResponse.json(row);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const before = db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key) as
    | RawMaterial
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 원재료를 찾을 수 없습니다." }, { status: 404 });
  }
  if (before.stock !== 0) {
    return NextResponse.json(
      { error: `재고가 남아있는 원재료는 삭제할 수 없습니다. (현재 재고: ${before.stock})` },
      { status: 400 }
    );
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 원재료는 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  db.prepare("DELETE FROM raw_material WHERE key = ?").run(key);
  logAudit("raw_material", `[${before.key}] ${before.name}`, "delete", actor, "삭제됨");
  return NextResponse.json({ ok: true });
}
