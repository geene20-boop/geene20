import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { logAudit, requireActor } from "@/lib/audit";
import { AuditTable } from "@/lib/auditTypes";

// 승인(잠금)/승인해제 공용 처리. 관리자만 승인·승인해제할 수 있고, 승인되면 관리자를 포함해
// 누구도 해당 기록을 수정/삭제할 수 없다 (packing/auth.ts의 canEditRecord/canDeleteRecord 참고).
export async function handleLockRequest<Row extends { locked: number }>(
  req: NextRequest,
  {
    idValue,
    table,
    auditTable,
    idColumn,
    buildRecordKey,
  }: {
    idValue: string;
    table: string;
    auditTable: AuditTable;
    idColumn: string;
    buildRecordKey: (row: Row) => string;
  }
): Promise<NextResponse> {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "승인/승인해제는 관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).get(idValue) as
    | Row
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  const locked = !!body.locked;
  if (locked) {
    db.prepare(
      `UPDATE ${table} SET locked = 1, approved_by = ?, approved_at = datetime('now') WHERE ${idColumn} = ?`
    ).run(actor, idValue);
  } else {
    db.prepare(`UPDATE ${table} SET locked = 0 WHERE ${idColumn} = ?`).run(idValue);
  }
  logAudit(auditTable, buildRecordKey(existing), "update", actor, locked ? "승인" : "승인해제");

  const row = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).get(idValue);
  return NextResponse.json(row);
}
