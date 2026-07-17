import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT metric, min_value, max_value FROM spec_limit").all();
  return NextResponse.json(rows);
}

export async function PUT(req: NextRequest) {
  const db = getDb();
  const body = await req.json(); // { metric, min_value, max_value }
  if (!body.metric) return NextResponse.json({ error: "metric은 필수입니다." }, { status: 400 });

  db.prepare(
    `INSERT INTO spec_limit (metric, min_value, max_value) VALUES (?, ?, ?)
     ON CONFLICT(metric) DO UPDATE SET min_value = excluded.min_value, max_value = excluded.max_value, updated_at = datetime('now')`
  ).run(body.metric, body.min_value ?? null, body.max_value ?? null);

  const rows = db.prepare("SELECT metric, min_value, max_value FROM spec_limit").all();
  return NextResponse.json(rows);
}
