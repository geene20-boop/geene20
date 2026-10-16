import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialDocument, RAW_MATERIAL_DOC_LABELS } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

function parseDataJson(dataJson: string): { rows: unknown[]; meta: unknown } {
  const parsed = JSON.parse(dataJson);
  if (Array.isArray(parsed)) return { rows: parsed, meta: null };
  return { rows: parsed.rows ?? [], meta: parsed.meta ?? null };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const before = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id) as
    | RawMaterialDocument
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json();
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
  }

  const existing = parseDataJson(before.data_json);
  const targetMaterial = body.targetMaterial !== undefined ? body.targetMaterial : before.target_material;
  const periodFrom = body.periodFrom !== undefined ? body.periodFrom : before.period_from;
  const periodTo = body.periodTo !== undefined ? body.periodTo : before.period_to;
  const memo = body.memo !== undefined ? body.memo : before.memo;

  db.prepare(
    `UPDATE raw_material_document SET
       target_material = ?, period_from = ?, period_to = ?, data_json = ?, memo = ?
     WHERE id = ?`
  ).run(
    targetMaterial,
    periodFrom,
    periodTo,
    JSON.stringify({ rows: body.rows, meta: body.meta !== undefined ? body.meta : existing.meta }),
    memo,
    id
  );

  logAudit(
    "raw_material_document",
    `${RAW_MATERIAL_DOC_LABELS[before.doc_type]} · ${targetMaterial ?? "-"}`,
    "update",
    actor,
    "문서 내용 수정"
  );

  const row = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id) as
    | RawMaterialDocument
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "삭제할 문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  db.prepare("DELETE FROM raw_material_document WHERE id = ?").run(id);
  logAudit(
    "raw_material_document",
    `${RAW_MATERIAL_DOC_LABELS[row.doc_type]} · ${row.target_material ?? "-"}`,
    "delete",
    actor,
    "삭제됨"
  );
  return NextResponse.json({ ok: true });
}
