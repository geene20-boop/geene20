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

// 화면에서 품목 키 입력란을 없앤 뒤로는 서버가 내부 식별용 고유 키를 자동 생성한다.
function generateItemKey(kind: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}_${Date.now().toString(36)}${rand}`;
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const kind = body.kind as PackingKind;
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind(product/bagmat/aux)는 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  let key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : generateItemKey(kind);
  while (db.prepare("SELECT key FROM packing_item WHERE key = ?").get(key)) {
    key = generateItemKey(kind);
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
    [body.category, body.sub].filter(Boolean).join(" ") || key,
    "create",
    actor,
    [kind, body.category, body.sub, body.unit].filter(Boolean).join("/")
  );

  const row = db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key);
  return NextResponse.json(row, { status: 201 });
}
