import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canDeleteRecord, canEditRecord } from "@/lib/auth";
import { PackingEntry } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { applyPackEffect, packingItemAuditLabel, runInTransaction } from "@/lib/packingStock";

function toEffect(row: PackingEntry) {
  return {
    productKey: row.product_key,
    qty: row.qty,
    bagMatKey: row.bag_mat_key,
    bagMatQty: row.bag_mat_qty,
    topsheetKey: row.topsheet_key,
    topsheetQty: row.topsheet_qty,
    wrapKey: row.wrap_key,
    wrapQty: row.wrap_qty,
    auxUseKey: row.aux_use_key,
    auxUseQty: row.aux_use_qty,
  };
}

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
  const before = db.prepare("SELECT * FROM packing_entry WHERE id = ?").get(id) as
    | PackingEntry
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "수정할 입력 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canEditRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 수정할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "수정 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const updated: PackingEntry = { ...before, ...body };
  if (typeof updated.qty !== "number" || updated.qty <= 0) {
    return NextResponse.json({ error: "qty는 0보다 커야 합니다." }, { status: 400 });
  }

  try {
    runInTransaction((db) => {
      if (before.type === "pack") {
        applyPackEffect(db, { ...toEffect(before), isProduction: true }, -1);
      } else {
        applyPackEffect(db, { productKey: before.product_key, qty: -before.qty }, -1);
      }
      if (updated.type === "pack") {
        applyPackEffect(db, { ...toEffect(updated), isProduction: true }, 1);
      } else {
        applyPackEffect(db, { productKey: updated.product_key, qty: -updated.qty }, 1);
      }
      db.prepare(
        `UPDATE packing_entry SET
           date = ?, type = ?, product_key = ?, qty = ?, unit = ?,
           topsheet_key = ?, topsheet_qty = ?, wrap_key = ?, wrap_qty = ?,
           bag_mat_key = ?, bag_mat_qty = ?, aux_use_key = ?, aux_use_qty = ?,
           worker = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        updated.date,
        updated.type,
        updated.product_key,
        updated.qty,
        updated.unit,
        updated.topsheet_key,
        updated.topsheet_qty,
        updated.wrap_key,
        updated.wrap_qty,
        updated.bag_mat_key,
        updated.bag_mat_qty,
        updated.aux_use_key,
        updated.aux_use_qty,
        updated.worker,
        actor,
        id
      );
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit(
    "packing_entry",
    `${updated.date} ${updated.type === "pack" ? "생산" : "출하"} ${packingItemAuditLabel(db, updated.product_key)}`,
    "update",
    actor,
    `이전: ${before.qty}${before.unit ?? ""} → 이후: ${updated.qty}${updated.unit ?? ""}`
  );

  const row = getDb().prepare("SELECT * FROM packing_entry WHERE id = ?").get(id);
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
  const before = db.prepare("SELECT * FROM packing_entry WHERE id = ?").get(id) as
    | PackingEntry
    | undefined;
  if (!before) {
    return NextResponse.json({ error: "삭제할 입력 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canDeleteRecord(req, before)) {
    const reason = before.locked
      ? "승인된 기록은 삭제할 수 없습니다. 관리자가 승인 해제해야 합니다."
      : "삭제 권한이 없습니다.";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  runInTransaction((db) => {
    if (before.type === "pack") {
      applyPackEffect(db, { ...toEffect(before), isProduction: true }, -1);
    } else {
      applyPackEffect(db, { productKey: before.product_key, qty: -before.qty }, -1);
    }
    db.prepare("DELETE FROM packing_entry WHERE id = ?").run(id);
  });

  logAudit(
    "packing_entry",
    `${before.date} ${before.type === "pack" ? "생산" : "출하"} ${packingItemAuditLabel(db, before.product_key)}`,
    "delete",
    actor,
    "삭제됨(재고 원복)"
  );
  return NextResponse.json({ ok: true });
}
