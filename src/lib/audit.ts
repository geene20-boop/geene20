import Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { AuditTable, AuditAction } from "@/lib/auditTypes";
import { getAccountById, getAdminName, getUserSession, hasAnyAccount, isAdminRequest } from "@/lib/auth";

// db를 넘기지 않으면 기본 앱 데이터베이스를 사용한다. 테스트처럼 별도의 db 인스턴스를 다루는
// 코드(예: 게시판 자동삭제)에서는 그 db를 그대로 넘겨 같은 연결에 기록되도록 한다.
export function logAudit(
  table: AuditTable,
  recordKey: string,
  action: AuditAction,
  actor: string,
  summary?: string,
  db: Database.Database = getDb()
): void {
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
    if (isAdminRequest(req)) return getAdminName(req) ?? "관리자";
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
