import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord, canEditRecord } from "@/lib/auth";
import { RawMaterialInbound, RawMaterialJudgment } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import {
  adjustRawMaterialStock,
  rawMaterialAuditLabel,
  recordPriceChangeIfNeeded,
  runInTransaction,
} from "@/lib/rawMaterialStock";

const VALID_JUDGMENTS: RawMaterialJudgment[] = ["OK", "NG"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare("SELECT * FROM raw_material_inbound WHERE id = ?").get(id) as
    | RawMaterialInbound
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 입고 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canEditRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 수정할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "수정 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const qty = typeof body.qty === "number" ? body.qty : before.qty;
  if (qty <= 0) {
    return NextResponse.json({ error: "수량은 0보다 커야 합니다." }, { status: 400 });
  }
  const judgment: RawMaterialJudgment = VALID_JUDGMENTS.includes(body.judgment) ? body.judgment : before.judgment;
  const unitPrice = body.unitPrice !== undefined ? body.unitPrice : before.unit_price;
  const amount = unitPrice != null ? unitPrice * qty : null;
  const date = body.date ?? before.date;
  const materialKey = body.materialKey ?? before.material_key;

  try {
    runInTransaction((db) => {
      adjustRawMaterialStock(db, before.material_key, -before.qty);
      adjustRawMaterialStock(db, materialKey, qty);
      recordPriceChangeIfNeeded(db, materialKey, unitPrice, date, actor);
      db.prepare(
        `UPDATE raw_material_inbound SET
           date = ?, material_key = ?, supplier_id = ?, supplier_name = ?, qty = ?, unit = ?,
           unit_price = ?, amount = ?, vehicle_no = ?, judgment = ?, problem = ?, reason = ?,
           action_taken = ?, judged_by = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        date,
        materialKey,
        body.supplierId !== undefined ? body.supplierId : before.supplier_id,
        body.supplierName !== undefined ? body.supplierName : before.supplier_name,
        qty,
        body.unit !== undefined ? body.unit : before.unit,
        unitPrice,
        amount,
        body.vehicleNo !== undefined ? body.vehicleNo : before.vehicle_no,
        judgment,
        body.problem !== undefined ? body.problem : before.problem,
        body.reason !== undefined ? body.reason : before.reason,
        body.actionTaken !== undefined ? body.actionTaken : before.action_taken,
        judgment === "NG" ? actor : before.judged_by,
        actor,
        id
      );
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit(
    "raw_material_inbound",
    `${date} ${rawMaterialAuditLabel(db, materialKey)}`,
    "update",
    actor,
    `이전: ${before.qty}${before.unit ?? ""}/${before.judgment} → 이후: ${qty}${body.unit ?? before.unit ?? ""}/${judgment}`
  );

  const row = db.prepare("SELECT * FROM raw_material_inbound WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare("SELECT * FROM raw_material_inbound WHERE id = ?").get(id) as
    | RawMaterialInbound
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 입고 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  runInTransaction((db) => {
    adjustRawMaterialStock(db, before.material_key, -before.qty);
    db.prepare("DELETE FROM raw_material_inbound WHERE id = ?").run(id);
  });

  logAudit(
    "raw_material_inbound",
    `${before.date} ${rawMaterialAuditLabel(db, before.material_key)}`,
    "delete",
    actor,
    "삭제됨(재고 원복)"
  );
  return NextResponse.json({ ok: true });
}
