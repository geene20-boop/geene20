import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PackingItem, PackingKind } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM packing_item ORDER BY kind, category, sub").all() as PackingItem[];
  return NextResponse.json(rows);
}

const VALID_KINDS: PackingKind[] = ["product", "bagmat", "aux"];

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const kind = body.kind as PackingKind;
  if (!key || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "key, kind(product/bagmat/aux)는 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare("SELECT key FROM packing_item WHERE key = ?").get(key);
  if (existing) {
    return NextResponse.json({ error: `이미 존재하는 품목 키입니다: ${key}` }, { status: 409 });
  }

  db.prepare(
    `INSERT INTO packing_item (key, kind, category, sub, unit, bag_kg, bag_mat_key, stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    key,
    kind,
    body.category ?? null,
    body.sub ?? null,
    body.unit ?? null,
    typeof body.bagKg === "number" ? body.bagKg : null,
    body.bagMatKey ?? null,
    typeof body.initialStock === "number" ? body.initialStock : 0
  );

  logAudit(
    "packing_item",
    key,
    "create",
    actor,
    [kind, body.category, body.sub, body.unit].filter(Boolean).join("/")
  );

  const row = db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key);
  return NextResponse.json(row, { status: 201 });
}
