import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialInbound, RawMaterialJudgment } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import {
  adjustRawMaterialStock,
  getRawMaterial,
  rawMaterialAuditLabel,
  recordPriceChangeIfNeeded,
  runInTransaction,
} from "@/lib/rawMaterialStock";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const judgment = searchParams.get("judgment");
  const materialKey = searchParams.get("materialKey");

  let sql = "SELECT * FROM raw_material_inbound WHERE date BETWEEN ? AND ?";
  const args: (string | number)[] = [from, to];
  if (judgment === "OK" || judgment === "NG") {
    sql += " AND judgment = ?";
    args.push(judgment);
  }
  if (materialKey) {
    sql += " AND material_key = ?";
    args.push(materialKey);
  }
  sql += " ORDER BY date DESC, created_at DESC";

  const rows = db.prepare(sql).all(...args) as RawMaterialInbound[];
  return NextResponse.json(rows);
}

const VALID_JUDGMENTS: RawMaterialJudgment[] = ["OK", "NG"];

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.date || !body.materialKey || typeof body.qty !== "number") {
    return NextResponse.json({ error: "날짜, 원재료, 수량은 필수입니다." }, { status: 400 });
  }
  if (body.qty <= 0) {
    return NextResponse.json({ error: "수량은 0보다 커야 합니다." }, { status: 400 });
  }
  const judgment: RawMaterialJudgment = VALID_JUDGMENTS.includes(body.judgment) ? body.judgment : "OK";
  if (judgment === "NG" && !body.problem) {
    return NextResponse.json({ error: "NG 판정 시 문제점을 입력해주세요." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const material = getRawMaterial(db, body.materialKey);
  if (!material) {
    return NextResponse.json({ error: "알 수 없는 원재료입니다." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const unitPrice = typeof body.unitPrice === "number" ? body.unitPrice : null;
  const amount = unitPrice != null ? unitPrice * body.qty : null;

  try {
    runInTransaction((db) => {
      adjustRawMaterialStock(db, body.materialKey, body.qty);
      recordPriceChangeIfNeeded(db, body.materialKey, unitPrice, body.date, actor);
      db.prepare(
        `INSERT INTO raw_material_inbound
         (id, date, material_key, supplier_id, supplier_name, qty, unit, unit_price, amount, vehicle_no,
          judgment, problem, reason, action_taken, judged_by, entered_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        body.date,
        body.materialKey,
        body.supplierId ?? null,
        body.supplierName ?? null,
        body.qty,
        body.unit ?? material.unit ?? null,
        unitPrice,
        amount,
        body.vehicleNo ?? null,
        judgment,
        body.problem ?? null,
        body.reason ?? null,
        body.actionTaken ?? null,
        judgment === "NG" ? actor : null,
        actor,
        actor
      );
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit(
    "raw_material_inbound",
    `${body.date} ${rawMaterialAuditLabel(db, body.materialKey)}`,
    "create",
    actor,
    `${body.qty}${body.unit ?? material.unit ?? ""} / ${judgment}${judgment === "NG" ? " - " + body.problem : ""}`
  );

  const row = db.prepare("SELECT * FROM raw_material_inbound WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
