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

// 원재료 코드는 화면에서 입력받지 않고 내부 식별자로만 자동 생성한다 (RM001, RM002, ...).
function generateMaterialKey(db: ReturnType<typeof getDb>): string {
  const existing = new Set(
    (db.prepare("SELECT key FROM raw_material").all() as { key: string }[]).map((r) => r.key)
  );
  let n = existing.size + 1;
  let key = `RM${String(n).padStart(3, "0")}`;
  while (existing.has(key)) {
    n += 1;
    key = `RM${String(n).padStart(3, "0")}`;
  }
  return key;
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const form = (body.form as RawMaterialForm) ?? "solid";
  if (!name || !VALID_FORMS.includes(form)) {
    return NextResponse.json({ error: "원재료명, 성상(고상/액상)은 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const key = generateMaterialKey(db);

  db.prepare(
    `INSERT INTO raw_material
     (key, name, form, category, unit, submit_to, stock, entered_by, updated_by,
      disclosure_no, disclosure_date, material_type, main_ingredients, disclosure_valid_from, disclosure_valid_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    key,
    name,
    form,
    body.category ?? null,
    body.unit ?? null,
    body.submitTo ?? null,
    typeof body.initialStock === "number" ? body.initialStock : 0,
    actor,
    actor,
    body.disclosureNo ?? null,
    body.disclosureDate ?? null,
    body.materialType ?? null,
    body.mainIngredients ?? null,
    body.disclosureValidFrom ?? null,
    body.disclosureValidTo ?? null
  );

  logAudit("raw_material", `[${key}] ${name}`, "create", actor, [form, body.category, body.unit].filter(Boolean).join("/"));

  const row = db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key);
  return NextResponse.json(row, { status: 201 });
}
