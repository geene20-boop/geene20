import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PackingEntry, PackingEntryType } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { applyPackEffect, runInTransaction } from "@/lib/packingStock";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM packing_entry WHERE date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC")
    .all(from, to) as PackingEntry[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const type = body.type as PackingEntryType;
  if (type !== "pack" && type !== "ship") {
    return NextResponse.json({ error: "type은 'pack' 또는 'ship'이어야 합니다." }, { status: 400 });
  }
  if (!body.date || !body.productKey || typeof body.qty !== "number") {
    return NextResponse.json({ error: "date, productKey, qty는 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const effect = {
    productKey: body.productKey,
    qty: body.qty,
    bagMatKey: body.bagMatKey ?? null,
    bagMatQty: body.bagMatQty ?? null,
    topsheetKey: body.topsheetKey ?? null,
    topsheetQty: body.topsheetQty ?? null,
    wrapKey: body.wrapKey ?? null,
    wrapQty: body.wrapQty ?? null,
    auxUseKey: body.auxUseKey ?? null,
    auxUseQty: body.auxUseQty ?? null,
  };

  try {
    runInTransaction((db) => {
      if (type === "pack") {
        applyPackEffect(db, { ...effect, isProduction: true }, 1);
      } else {
        applyPackEffect(db, { productKey: body.productKey, qty: -body.qty }, 1);
      }
      db.prepare(
        `INSERT INTO packing_entry
         (id, date, type, product_key, qty, unit, topsheet_key, topsheet_qty, wrap_key, wrap_qty,
          bag_mat_key, bag_mat_qty, aux_use_key, aux_use_qty, worker, entered_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        body.date,
        type,
        body.productKey,
        body.qty,
        body.unit ?? null,
        body.topsheetKey ?? null,
        body.topsheetQty ?? null,
        body.wrapKey ?? null,
        body.wrapQty ?? null,
        body.bagMatKey ?? null,
        body.bagMatQty ?? null,
        body.auxUseKey ?? null,
        body.auxUseQty ?? null,
        body.worker ?? null,
        actor,
        actor
      );
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit(
    "packing_entry",
    `${body.date} ${type === "pack" ? "생산" : "출하"} ${body.productKey}`,
    "create",
    actor,
    `${body.qty}${body.unit ?? ""}`
  );

  const row = getDb().prepare("SELECT * FROM packing_entry WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
