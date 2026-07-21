import { getDb } from "@/lib/db";
import { AuditTable, AuditAction } from "@/lib/auditTypes";
import { getAccountById, getUserSession, hasAnyAccount, isAdminRequest } from "@/lib/auth";

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

type ReqLike = { cookies: { get(name: string): { value: string } | undefined } };

// 입력자 이름을 확정한다. 계정이 하나라도 있으면(로그인 필수 모드) 클라이언트가 보낸
// entered_by는 무시하고 실제 로그인한 계정 이름으로 강제해서, 다른 사람 이름으로
// 기록을 남기는 것을 원천적으로 막는다. 계정이 없는 개방 모드에서는 기존처럼
// 요청 바디의 entered_by를 그대로 사용한다.
export function requireActor(req: ReqLike, body: unknown): string | null {
  if (hasAnyAccount()) {
    if (isAdminRequest(req)) return "관리자";
    const session = getUserSession(req);
    if (!session) return null;
    const account = getAccountById(session.accountId);
    const name = account?.display_name || account?.username;
    return name ? name.slice(0, 40) : null;
  }

  const name = (body as Record<string, unknown> | null | undefined)?.entered_by;
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed.slice(0, 40) : null;
}
