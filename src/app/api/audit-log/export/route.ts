import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AuditLogRow, TABLE_LABELS, ACTION_LABELS } from "@/lib/auditTypes";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";
import { formatKst } from "@/lib/kst";

// 이력 관리 화면과 동일한 조건으로 엑셀 다운로드 (감사/품질기록 보관용)
export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const actor = searchParams.get("actor");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

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
    conditions.push("date(created_at, '+9 hours') >= date(?)");
    params.push(from);
  }
  if (to) {
    conditions.push("date(created_at, '+9 hours') <= date(?)");
    params.push(to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT 5000`)
    .all(...params) as AuditLogRow[];

  const sheetRows = rows.map((r) => ({
    시간: formatKst(r.created_at),
    구분: TABLE_LABELS[r.table_name],
    항목: r.record_key,
    동작: ACTION_LABELS[r.action],
    입력자: r.actor,
    내용: r.summary ?? "",
  }));

  const buffer = buildXlsxBuffer(sheetRows, "이력관리");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`이력관리_${from ?? "전체"}_${to ?? "전체"}.xlsx`),
  });
}
