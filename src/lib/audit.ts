import { getDb } from "@/lib/db";
import { AuditTable, AuditAction } from "@/lib/auditTypes";

export function logAudit(
  table: AuditTable,
  recordKey: string,
  action: AuditAction,
  actor: string,
  summary?: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (table_name, record_key, action, actor, summary) VALUES (?, ?, ?, ?, ?)`
  ).run(table, recordKey, action, actor, summary ?? null);
}

// 요청 바디에서 입력자 이름을 꺼내 검증. 비어있으면 null 반환(라우트에서 400 처리).
export function requireActor(body: unknown): string | null {
  const name = (body as Record<string, unknown> | null | undefined)?.entered_by;
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed.slice(0, 40) : null;
}
