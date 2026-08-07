import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RawMaterialForm } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM raw_material ORDER BY key").all() as RawMaterial[];
  return NextResponse.json(rows);
}

const VALID_FORMS: RawMaterialForm[] = ["solid", "liquid"];

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const form = (body.form as RawMaterialForm) ?? "solid";
  if (!key || !name || !VALID_FORMS.includes(form)) {
    return NextResponse.json({ error: "코드, 원재료명, 성상(고상/액상)은 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare("SELECT key FROM raw_material WHERE key = ?").get(key);
  if (existing) {
    return NextResponse.json({ error: `이미 존재하는 코드입니다: ${key}` }, { status: 409 });
  }

  db.prepare(
    `INSERT INTO raw_material (key, name, form, category, unit, submit_to, stock, entered_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    key,
    name,
    form,
    body.category ?? null,
    body.unit ?? null,
    body.submitTo ?? null,
    typeof body.initialStock === "number" ? body.initialStock : 0,
    actor,
    actor
  );

  logAudit("raw_material", `[${key}] ${name}`, "create", actor, [form, body.category, body.unit].filter(Boolean).join("/"));

  const row = db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key);
  return NextResponse.json(row, { status: 201 });
}
