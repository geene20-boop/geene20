import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialDocType, RawMaterialDocument, RAW_MATERIAL_DOC_LABELS } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

const VALID_DOC_TYPES: RawMaterialDocType[] = [
  "form19_2",
  "form40",
  "inbound_certificate",
  "product_certificate",
];

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM raw_material_document ORDER BY created_at DESC")
    .all() as RawMaterialDocument[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const docType = body.docType as RawMaterialDocType;
  if (!VALID_DOC_TYPES.includes(docType)) {
    return NextResponse.json({ error: "양식 종류를 선택해주세요." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO raw_material_document
     (id, doc_type, title, target_material, period_from, period_to, data_json, memo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    docType,
    body.title ?? RAW_MATERIAL_DOC_LABELS[docType],
    body.targetMaterial ?? null,
    body.periodFrom ?? null,
    body.periodTo ?? null,
    JSON.stringify(body.rows),
    body.memo ?? null,
    actor
  );

  logAudit(
    "raw_material_document",
    `${RAW_MATERIAL_DOC_LABELS[docType]} · ${body.targetMaterial ?? "-"}`,
    "create",
    actor,
    `${body.periodFrom ?? ""}~${body.periodTo ?? ""}`
  );

  const row = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
