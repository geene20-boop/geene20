import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AuditLogRow } from "@/lib/auditTypes";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table"); // optional filter
  const actor = searchParams.get("actor"); // optional substring filter
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (table) {
    conditions.push("table_name = ?");
    params.push(table);
  }
  if (actor) {
    conditions.push("actor LIKE ?");
    params.push(`%${actor}%`);
  }
  if (from) {
    conditions.push("date(created_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    conditions.push("date(created_at) <= date(?)");
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(...params, limit) as AuditLogRow[];

  return NextResponse.json({ rows });
}
