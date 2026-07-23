import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { PackingAdjustment } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { adjustStock, packingItemAuditLabel, runInTransaction } from "@/lib/packingStock";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM packing_adjustment WHERE date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC")
    .all(from, to) as PackingAdjustment[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "전일재고 조정은 관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const body = await req.json();
  if (!body.date || !body.key || typeof body.qty !== "number") {
    return NextResponse.json({ error: "date, key, qty(증감값)는 필수입니다." }, { status: 400 });
  }
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  try {
    runInTransaction((db) => {
      adjustStock(db, body.key, body.qty);
      db.prepare(
        "INSERT INTO packing_adjustment (id, date, kind, key, qty, reason, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, body.date, body.kind ?? null, body.key, body.qty, body.reason ?? null, actor);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit(
    "packing_adjustment",
    `${body.date} ${packingItemAuditLabel(getDb(), body.key)}`,
    "create",
    actor,
    `${body.qty > 0 ? "+" : ""}${body.qty}${body.reason ? ` (${body.reason})` : ""}`
  );
  const row = getDb().prepare("SELECT * FROM packing_adjustment WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
