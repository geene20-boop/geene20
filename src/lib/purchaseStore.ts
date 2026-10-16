import Database from "better-sqlite3";
import { PurchaseAttachment, PurchaseRequest, PurchaseView } from "@/lib/types";

// [구매발주] 조회·기록 공용 함수 (서버 전용). db를 인자로 받아 테스트에서 메모리 DB로 검증할 수 있게 한다.

// 구매요청은 순위대로, 발주는 입고예정일 빠른 순, 입고는 최근 입고 순
const ORDER = `ORDER BY CASE status WHEN 'requested' THEN 0 WHEN 'ordered' THEN 1 WHEN 'received' THEN 2 ELSE 3 END,
  CASE WHEN status = 'requested' THEN priority END ASC,
  CASE WHEN status = 'ordered' THEN eta END ASC,
  CASE WHEN status = 'received' THEN received_date END DESC,
  id DESC`;

function attachExtras(db: Database.Database, rows: PurchaseRequest[]): PurchaseView[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const atts = db
    .prepare(
      `SELECT id, request_id, which, file_name, mime_type FROM purchase_attachment WHERE request_id IN (${ph}) ORDER BY id`
    )
    .all(...ids) as (PurchaseAttachment & { request_id: number })[];
  const counts = db
    .prepare(
      `SELECT request_id, COUNT(*) AS cnt FROM purchase_comment
       WHERE kind = 'comment' AND request_id IN (${ph}) GROUP BY request_id`
    )
    .all(...ids) as { request_id: number; cnt: number }[];
  const lastAdmin = db
    .prepare(
      `SELECT c.request_id, c.body FROM purchase_comment c
       JOIN (SELECT request_id, MAX(id) AS id FROM purchase_comment
             WHERE kind = 'comment' AND role = '승인자' AND request_id IN (${ph}) GROUP BY request_id) m ON m.id = c.id`
    )
    .all(...ids) as { request_id: number; body: string }[];
  const countBy = new Map(counts.map((c) => [c.request_id, c.cnt]));
  const adminBy = new Map(lastAdmin.map((c) => [c.request_id, c.body]));
  return rows.map((r) => ({
    ...r,
    attachments: atts
      .filter((a) => a.request_id === r.id)
      .map((a) => ({ id: a.id, which: a.which, file_name: a.file_name, mime_type: a.mime_type })),
    comment_count: countBy.get(r.id) ?? 0,
    last_admin_comment: adminBy.get(r.id) ?? null,
  }));
}

export function loadPurchaseViews(db: Database.Database): PurchaseView[] {
  return attachExtras(db, db.prepare(`SELECT * FROM purchase_request ${ORDER}`).all() as PurchaseRequest[]);
}

export function loadPurchaseView(db: Database.Database, id: number | string): PurchaseView | null {
  const row = loadPurchase(db, id);
  return row ? attachExtras(db, [row])[0] : null;
}

export function loadPurchase(db: Database.Database, id: number | string): PurchaseRequest | undefined {
  return db.prepare("SELECT * FROM purchase_request WHERE id = ?").get(id) as PurchaseRequest | undefined;
}

export function addPurchaseHistory(db: Database.Database, id: number | string, author: string, body: string): void {
  db.prepare(
    `INSERT INTO purchase_comment (request_id, kind, author, role, body) VALUES (?, 'history', ?, NULL, ?)`
  ).run(id, author, body.slice(0, 1000));
}

export function addPurchaseComment(
  db: Database.Database,
  id: number | string,
  author: string,
  role: string | null,
  body: string
): number {
  const info = db
    .prepare(`INSERT INTO purchase_comment (request_id, kind, author, role, body) VALUES (?, 'comment', ?, ?, ?)`)
    .run(id, author, role, body.slice(0, 1000));
  return Number(info.lastInsertRowid);
}

export function addPurchaseAttachment(
  db: Database.Database,
  id: number | string,
  which: "request" | "delivery",
  fileName: string,
  filePath: string,
  mime: string | null,
  createdBy: string
): void {
  db.prepare(
    `INSERT INTO purchase_attachment (request_id, which, file_name, file_path, mime_type, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, which, fileName.slice(0, 120), filePath, mime, createdBy);
}

// 구매요청 목록(화면 순서) id
export function requestedOrder(db: Database.Database): number[] {
  return (
    db.prepare("SELECT id FROM purchase_request WHERE status = 'requested' ORDER BY priority ASC, id ASC").all() as {
      id: number;
    }[]
  ).map((r) => r.id);
}

// 순서 배열 그대로 1부터 순위를 다시 매긴다.
export function writeOrder(db: Database.Database, ids: number[]): void {
  const update = db.prepare("UPDATE purchase_request SET priority = ? WHERE id = ?");
  ids.forEach((id, i) => update.run(i + 1, id));
}

// 새 요청(또는 다시 요청)을 목록에 넣는다: 긴급이면 맨 위, 아니면 맨 아래.
export function placeInOrder(db: Database.Database, id: number, urgent: boolean): void {
  const rest = requestedOrder(db).filter((x) => x !== id);
  writeOrder(db, urgent ? [id, ...rest] : [...rest, id]);
}

// 메뉴 옆 숫자: 관리자(승인자)는 승인 대기 건수, 그 외에는 0
export function countPurchaseTodo(db: Database.Database, isApprover: boolean): number {
  if (!isApprover) return 0;
  return (db.prepare("SELECT COUNT(*) AS n FROM purchase_request WHERE status = 'requested'").get() as { n: number }).n;
}
