import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord, canEditRecord } from "@/lib/auth";
import { PackingItem } from "@/lib/types";
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

  const before = db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key) as
    | PackingItem
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 품목을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canEditRecord(req, before)) {
    const reason = before.locked
      ? "승인된 품목은 수정할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "수정 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const category = body.category !== undefined && body.category !== "" ? body.category : before.category;
  const sub = body.sub !== undefined && body.sub !== "" ? body.sub : before.sub;
  const unit = body.unit !== undefined && body.unit !== "" ? body.unit : before.unit;
  const bagKg = typeof body.bagKg === "number" ? body.bagKg : before.bag_kg;
  const stock = typeof body.stock === "number" ? body.stock : before.stock;
  const cumulativeProduced =
    typeof body.cumulativeProduced === "number" ? body.cumulativeProduced : before.cumulative_produced;

  db.prepare(
    "UPDATE packing_item SET category = ?, sub = ?, unit = ?, bag_kg = ?, stock = ?, cumulative_produced = ? WHERE key = ?"
  ).run(category, sub, unit, bagKg, stock, cumulativeProduced, key);

  logAudit(
    "packing_item",
    [category, sub].filter(Boolean).join(" ") || key,
    "update",
    actor,
    `이전: ${before.category}/${before.sub}/${before.unit}/${before.stock}/${before.cumulative_produced} → 이후: ${category}/${sub}/${unit}/${stock}/${cumulativeProduced}`
  );

  const row = db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key);
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

  const before = db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key) as
    | PackingItem
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 품목을 찾을 수 없습니다." }, { status: 404 });
  }
  if (before.stock !== 0) {
    return NextResponse.json(
      {
        error: `수량(재고)이 남아있는 품목은 삭제할 수 없습니다. 먼저 "전일재고 수정"으로 수량을 0으로 만든 뒤 다시 시도해주세요. (현재 수량: ${before.stock})`,
      },
      { status: 400 }
    );
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 품목은 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  db.prepare("DELETE FROM packing_item WHERE key = ?").run(key);
  logAudit(
    "packing_item",
    [before.category, before.sub].filter(Boolean).join(" ") || key,
    "delete",
    actor,
    [before.kind, before.category, before.sub, before.unit].filter(Boolean).join("/") + " 삭제됨"
  );
  return NextResponse.json({ ok: true });
}
