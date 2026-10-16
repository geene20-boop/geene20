// [구매발주] 테이블 정의. db.ts가 앱 시작 시 실행하고, 테스트도 같은 정의로 메모리 DB를 만든다.
export const PURCHASE_SCHEMA_SQL = `
-- [구매발주] 구매요청 → 관리자 승인(발주) → 입고. 한 건이 단계를 따라 status만 바뀐다.
CREATE TABLE IF NOT EXISTS purchase_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'requested',     -- 'requested' | 'ordered' | 'received' | 'rejected' | 'on_hold'
  priority INTEGER NOT NULL DEFAULT 0,          -- 구매요청 목록 내 우선순위 (작을수록 우선)
  part_name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'EA',
  expected_date TEXT,
  budget REAL NOT NULL DEFAULT 0,
  vendor TEXT,
  purpose TEXT NOT NULL DEFAULT '기타',
  purpose_detail TEXT NOT NULL DEFAULT '',
  urgent INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')), -- 승인 대기 시작 시각 (다시 요청하면 새로 시작)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT,
  approved_at TEXT,
  order_date TEXT,
  eta TEXT,
  order_amount REAL,
  received_qty REAL NOT NULL DEFAULT 0,
  received_date TEXT,
  received_by TEXT,
  kakao_shared_at TEXT,
  kakao_shared_by TEXT,
  decline_reason TEXT,
  declined_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_request_status ON purchase_request(status, priority);

-- 구매발주 의견(요청자·승인자 대화)과 진행 이력(상태 변경 자동 기록)
CREATE TABLE IF NOT EXISTS purchase_comment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment',         -- 'comment' | 'history'
  author TEXT NOT NULL,
  role TEXT,                                    -- '승인자' | '요청자' | NULL
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchase_comment_request ON purchase_comment(request_id, id);

-- 구매발주 첨부: 요청 시 견적서·부품 사진, 입고 시 납품 사진
CREATE TABLE IF NOT EXISTS purchase_attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  which TEXT NOT NULL DEFAULT 'request',        -- 'request' | 'delivery'
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchase_attachment_request ON purchase_attachment(request_id, id);
`;
