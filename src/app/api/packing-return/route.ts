import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PackingReturn } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import { adjustStock, runInTransaction } from "@/lib/packingStock";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM packing_return WHERE date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC")
    .all(from, to) as PackingReturn[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.date || !body.key || typeof body.qty !== "number") {
    return NextResponse.json({ error: "date, key, qty는 필수입니다." }, { status: 400 });
  }
  if (body.qty <= 0) {
    return NextResponse.json({ error: "qty는 0보다 커야 합니다." }, { status: 400 });
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
        "INSERT INTO packing_return (id, date, kind, key, qty, worker, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, body.date, body.kind ?? null, body.key, body.qty, body.worker ?? null, actor);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  logAudit("packing_return", `${body.date} ${body.key}`, "create", actor, `+${body.qty}`);
  const row = getDb().prepare("SELECT * FROM packing_return WHERE id = ?").get(id);
  return NextResponse.json(row, { status: 201 });
}
