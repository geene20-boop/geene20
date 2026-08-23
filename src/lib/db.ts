import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { saveAttachmentFile } from "@/lib/fileStorage";

const DATA_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  var __db: Database.Database | undefined;
}

// 예전 버전에서 만들어진 DB는 첨부 원본을 data BLOB 컬럼에 그대로 들고 있다.
// 그 컬럼이 아직 남아있으면(=파일 분리 이전 DB) 한 번만 파일로 옮기고 테이블을 다시 만든다.
// (SQLite는 컬럼 삭제를 ALTER TABLE로 직접 지원하지 않아 테이블을 재생성한다.)
// 이전 배포에서 마이그레이션이 중간에 끊겨(예: 파일 쓰기 실패, 프로세스 재시작) _old_blob
// 테이블이 남아있는 상태를 복구한다. 새 테이블까지 이미 있으면 데이터 복사는 끝난 것이므로
// 남은 옛 테이블만 정리하고, 새 테이블이 없으면 이름을 되돌려 처음부터 다시 시도할 수 있게 한다.
// 반드시 아래의 `CREATE TABLE IF NOT EXISTS board_attachment/document_file` 스키마 생성보다
// 먼저 호출해야 한다 - 그 스키마 블록이 먼저 실행되면 새 테이블이 빈 채로 만들어져 버려서,
// 이 함수가 "이미 마이그레이션 끝남"으로 오판하고 원본 데이터가 든 _old_blob을 그냥 지워버린다.
function recoverInterruptedBlobMigration(db: Database.Database, tableName: string): void {
  const oldName = `${tableName}_old_blob`;
  const tableExists = (name: string) =>
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
  if (!tableExists(oldName)) return;
  if (tableExists(tableName)) {
    db.exec(`DROP TABLE ${oldName}`);
  } else {
    db.exec(`ALTER TABLE ${oldName} RENAME TO ${tableName}`);
  }
}

function migrateBoardAttachmentBlobsToFiles(db: Database.Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(board_attachment)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!cols.has("data")) return; // 이미 마이그레이션됨

  const rows = db
    .prepare("SELECT id, post_id, filename, mime_type, size, data, created_at FROM board_attachment")
    .all() as {
    id: number;
    post_id: number;
    filename: string;
    mime_type: string | null;
    size: number;
    data: Buffer;
    created_at: string;
  }[];

  const runMigration = db.transaction(() => {
    db.exec("ALTER TABLE board_attachment RENAME TO board_attachment_old_blob");
    db.exec(`
      CREATE TABLE board_attachment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES board_post(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const insert = db.prepare(
      "INSERT INTO board_attachment (id, post_id, filename, mime_type, size, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const row of rows) {
      const filePath = saveAttachmentFile("board", row.filename, row.data);
      insert.run(row.id, row.post_id, row.filename, row.mime_type, row.size, filePath, row.created_at);
    }
    db.exec("DROP TABLE board_attachment_old_blob");
  });
  runMigration();
  db.exec("CREATE INDEX IF NOT EXISTS idx_board_attachment_post ON board_attachment(post_id)");
}

// 유기농업자재 공시 유효기간은 시작일로부터 3년째 되는 날 하루 전까지 (예: 2024-08-08 → 2027-08-07)
function addThreeYearsMinusOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setFullYear(d.getFullYear() + 3);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 유기농업자재 공시 3종 + 비료관리법 원료장부 2종(양식출력)에 쓰이는 원재료 마스터데이터를 채워 넣는다.
// 이름으로 이미 등록되어 있으면 새로 만들지 않되, 공시정보(disclosure_no)가 아직 비어있는 경우에는
// 채워 넣는다 — 화면에서 원재료만 먼저 등록해두고 공시정보는 비어있던 경우를 자동으로 보완하기 위함.
// 이미 공시정보가 입력되어 있으면(누군가 직접 채워뒀으면) 절대 덮어쓰지 않는다.
function seedDisclosureRawMaterials(db: Database.Database): void {
  const existing = db
    .prepare("SELECT key, name, disclosure_no FROM raw_material")
    .all() as { key: string; name: string; disclosure_no: string | null }[];
  const byName = new Map(existing.map((r) => [r.name, r]));

  function nextKey(): string {
    const keys = new Set(
      (db.prepare("SELECT key FROM raw_material").all() as { key: string }[]).map((r) => r.key)
    );
    let n = keys.size + 1;
    let key = `RM${String(n).padStart(3, "0")}`;
    while (keys.has(key)) {
      n += 1;
      key = `RM${String(n).padStart(3, "0")}`;
    }
    return key;
  }

  const insert = db.prepare(
    `INSERT INTO raw_material
     (key, name, form, unit, disclosure_no, disclosure_date, material_type, main_ingredients, disclosure_valid_from, disclosure_valid_to)
     VALUES (?, ?, 'solid', ?, ?, ?, ?, ?, ?, ?)`
  );
  const backfill = db.prepare(
    `UPDATE raw_material SET
       disclosure_no = ?, disclosure_date = ?, material_type = ?, main_ingredients = ?,
       disclosure_valid_from = ?, disclosure_valid_to = ?
     WHERE key = ?`
  );

  // 별지 제40호서식(유기농업자재 공시) 대표 자재 3종 — 공시정보 포함
  const disclosureMaterials: {
    name: string;
    disclosureNo: string;
    disclosureDate: string;
    materialType: string;
    mainIngredients: string;
    validFrom: string;
  }[] = [
    {
      name: "생생나라 고토",
      disclosureNo: "제 공시-2-3-454호",
      disclosureDate: "2018-08-08",
      materialType: "토양개량 및 작물생육용",
      mainIngredients: "백운석 95%, 당밀 5%",
      validFrom: "2024-08-08",
    },
    {
      name: "생생나라 규산",
      disclosureNo: "제 공시-2-3-453호",
      disclosureDate: "2018-08-08",
      materialType: "토양개량 및 작물생육용",
      mainIngredients: "베이직슬래그 95%, 당밀 5%",
      validFrom: "2024-08-08",
    },
    {
      name: "생생황마그유황칼슘",
      disclosureNo: "제 공시-3-3-729호",
      disclosureDate: "2025-02-20",
      materialType: "토양개량 및 작물생육용",
      mainIngredients: "가용성고토 9.8%, 알카리분 45.3%, 황전량 16%",
      validFrom: "2025-02-20",
    },
  ];
  for (const m of disclosureMaterials) {
    const validTo = addThreeYearsMinusOneDay(m.validFrom);
    const found = byName.get(m.name);
    if (!found) {
      const key = nextKey();
      insert.run(key, m.name, "kg", m.disclosureNo, m.disclosureDate, m.materialType, m.mainIngredients, m.validFrom, validTo);
      byName.set(m.name, { key, name: m.name, disclosure_no: m.disclosureNo });
    } else if (!found.disclosure_no) {
      backfill.run(m.disclosureNo, m.disclosureDate, m.materialType, m.mainIngredients, m.validFrom, validTo, found.key);
      found.disclosure_no = m.disclosureNo;
    }
  }

  // 별지 제19호의2서식(비료관리법 원료장부)에 쓰이는 원료 2종 — 공시정보 없이 이름만
  for (const name of ["분백운석", "수재슬래그"]) {
    if (byName.has(name)) continue;
    const key = nextKey();
    insert.run(key, name, "kg", null, null, null, null, null, null);
    byName.set(name, { key, name, disclosure_no: null });
  }
}

function migrateDocumentFileBlobsToFiles(db: Database.Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(document_file)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!cols.has("data")) return; // 이미 마이그레이션됨

  const rows = db
    .prepare(
      `SELECT id, doc_type, category, item_name, language, ref_date, filename, mime_type, size, data, entered_by, created_at
       FROM document_file`
    )
    .all() as {
    id: number;
    doc_type: string;
    category: string;
    item_name: string;
    language: string | null;
    ref_date: string | null;
    filename: string;
    mime_type: string | null;
    size: number;
    data: Buffer;
    entered_by: string;
    created_at: string;
  }[];

  const runMigration = db.transaction(() => {
    db.exec("ALTER TABLE document_file RENAME TO document_file_old_blob");
    db.exec(`
      CREATE TABLE document_file (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_type TEXT NOT NULL,
        category TEXT NOT NULL,
        item_name TEXT NOT NULL,
        language TEXT,
        ref_date TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        entered_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const insert = db.prepare(
      `INSERT INTO document_file
         (id, doc_type, category, item_name, language, ref_date, filename, mime_type, size, file_path, entered_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows) {
      const filePath = saveAttachmentFile("documents", row.filename, row.data);
      insert.run(
        row.id,
        row.doc_type,
        row.category,
        row.item_name,
        row.language,
        row.ref_date,
        row.filename,
        row.mime_type,
        row.size,
        filePath,
        row.entered_by,
        row.created_at
      );
    }
    db.exec("DROP TABLE document_file_old_blob");
  });
  runMigration();
  db.exec("CREATE INDEX IF NOT EXISTS idx_document_file_type ON document_file(doc_type, item_name)");
}

// SQLite의 ALTER TABLE RENAME은 기본적으로 다른 테이블의 외래키 참조 문구도 함께 새 이름으로
// 바꿔준다. 예전 배포에서 document_file을 document_file_old_blob으로 리네임하는 순간
// lab_journal의 linked_report_id 참조가 "document_file_old_blob"을 가리키도록 바뀌었고,
// 바로 뒤에 document_file을 새로 만들어도 이미 끊어진 그 참조는 저절로 되돌아오지 않았다.
// 그 결과 그 이후로는 연구실험일지 저장(INSERT)이 항상 "no such table:
// main.document_file_old_blob" 오류로 실패한다. 이미 이렇게 망가진 채 배포된 DB를 여기서
// lab_journal 테이블을 올바른 참조로 재생성해 복구한다. (앞으로의 리네임은 getDb() 시작 시
// legacy_alter_table을 켜서 애초에 참조를 건드리지 않도록 막는다.)
function repairLabJournalForeignKeyReference(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lab_journal'")
    .get() as { sql: string } | undefined;
  if (!row || !row.sql.includes("document_file_old_blob")) return;

  const fixedSql = row.sql
    .replace(/document_file_old_blob/g, "document_file")
    .replace(/CREATE TABLE lab_journal/, "CREATE TABLE lab_journal_fixed");

  db.transaction(() => {
    db.exec(fixedSql);
    db.exec("INSERT INTO lab_journal_fixed SELECT * FROM lab_journal");
    db.exec("DROP TABLE lab_journal");
    db.exec("ALTER TABLE lab_journal_fixed RENAME TO lab_journal");
  })();
  db.exec("CREATE INDEX IF NOT EXISTS idx_lab_journal_date ON lab_journal(date)");
}

export function getDb(): Database.Database {
  if (global.__db) return global.__db;

  const db = new Database(DB_PATH);
  // WAL은 mmap/파일 잠금을 정교하게 지원하는 로컬 디스크가 필요하다.
  // Railway 등 네트워크 볼륨에서는 WAL이 네이티브 모듈을 크래시시킬 수 있어 DELETE 저널을 사용한다.
  db.pragma("journal_mode = DELETE");
  // ALTER TABLE RENAME이 다른 테이블의 외래키 참조 문구까지 자동으로 바꿔버리는 SQLite 기본
  // 동작을 끈다 (아래 마이그레이션들이 document_file/board_attachment를 리네임했다가 같은
  // 이름으로 재생성하는데, 이 동작이 켜져 있으면 그 사이 다른 테이블의 참조가 옛 이름으로
  // 영구히 바뀌어 버린다 - repairLabJournalForeignKeyReference가 복구하는 문제가 바로 이것).
  db.pragma("legacy_alter_table = ON");

  // 아래 스키마 생성 블록의 `CREATE TABLE IF NOT EXISTS board_attachment/document_file`가
  // 먼저 실행되면, 마이그레이션이 중간에 끊겨 새 테이블이 아직 없던 상태에서도 여기서 빈
  // 새 스키마 테이블이 만들어져 버린다. 그러면 recoverInterruptedBlobMigration이 "새 테이블이
  // 이미 있으니 복사는 끝났다"고 오판해 원본 데이터가 든 _old_blob 테이블을 그냥 지워버려
  // 데이터가 유실된다. 그 스키마 블록보다 먼저 복구를 실행해, 필요하면 원래 이름으로
  // 되돌려 놓은 뒤 CREATE TABLE IF NOT EXISTS가 기존(구 스키마) 테이블을 건드리지 않게 한다.
  recoverInterruptedBlobMigration(db, "board_attachment");
  recoverInterruptedBlobMigration(db, "document_file");

  db.exec(`
    CREATE TABLE IF NOT EXISTS production_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,               -- YYYY-MM-DD
      shift TEXT NOT NULL,              -- '주' | '야'
      product TEXT,
      daily_pack_amount REAL,           -- 일일포장량(ton)
      dryer_temp_a REAL,                -- 건조로 셋팅 온도 A
      dryer_temp_b REAL,                -- 건조로 셋팅 온도 B
      feed_hopper_a REAL,               -- 원료 피딩 A호퍼(Hz)
      feed_hopper_b REAL,               -- 원료 피딩 B호퍼(Hz)
      feed_fine_powder REAL,            -- A/B미분(Hz)
      feed_mixer REAL,                  -- 혼합기(Hz)
      feed_molder REAL,                 -- 성형기(Hz)
      feed_total REAL,                  -- 조립제 투입 합계(Hz)
      brix REAL,                        -- 조립제 Brix (수기입력, QC 평균으로 자동 대체 가능)
      line_hours_a REAL,                -- A라인 가동시간
      line_hours_b REAL,                -- B라인 가동시간
      line_hours_total REAL,            -- A+B 합계시간
      lng_dryer REAL,                   -- LNG 사용량 - 건조로 누계(㎥)
      lng_rto REAL,                     -- LNG 사용량 - RTO 누계(㎥)
      gas_usage_shift REAL,             -- 조별 사용량(㎥)
      gas_usage_total REAL,             -- 사용량 합계(㎥)
      moisture_manual REAL,             -- 수분량(수기입력, 없으면 QC평균 사용)
      hardness_manual REAL,             -- 경도(수기입력, 없으면 QC평균 사용)
      note TEXT,
      worker TEXT,                      -- 작업자 이름
      granulation_agent TEXT,           -- 조립제 이름
      granulation_usage_per_min REAL,   -- 조립제 분당 사용량
      downtime_hours REAL,              -- 비가동시간 (A+B 가동시간에서 차감)
      carryover_dryer REAL,             -- 전일재고량 - 건조로 누계 (관리자 수정 가능)
      carryover_rto REAL,               -- 전일재고량 - RTO 누계 (관리자 수정 가능)
      locked INTEGER NOT NULL DEFAULT 0, -- 확정됨(1)이면 관리자가 해제하기 전엔 수정 불가
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, shift)
    );

    CREATE TABLE IF NOT EXISTS qc_test (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_no INTEGER,
      fertilizer_type TEXT,
      date TEXT NOT NULL,               -- YYYY-MM-DD (생산일자 - 조업/생산일지 연동 기준)
      shift TEXT NOT NULL,              -- '주' | '야' (테스트 시각 기준 자동/수기 지정)
      time TEXT,                        -- HH:MM (생산시각)
      measured_date TEXT,               -- 측정일자 (실제로 측정한 날짜, 생산일자와 다를 수 있음)
      measured_time TEXT,               -- 측정시각
      v1 REAL, v2 REAL, v3 REAL, v4 REAL, v5 REAL,
      v6 REAL, v7 REAL, v8 REAL, v9 REAL, v10 REAL,
      v11 REAL, v12 REAL, v13 REAL, v14 REAL, v15 REAL,
      v16 REAL, v17 REAL, v18 REAL, v19 REAL, v20 REAL,
      burner_temp REAL,                 -- 생산조건 - 버너
      granulation_brix REAL,            -- 생산조건 - 조립제 당도
      granulation_input REAL,           -- 생산조건 - 조립제 투입량
      fine_powder REAL,                 -- 생산조건 - 미분말
      hopper REAL,                      -- 생산조건 - 호퍼 (구버전, hopper_a/b로 대체됨)
      hopper_a REAL,                    -- 생산조건 - 호퍼 A
      hopper_b REAL,                    -- 생산조건 - 호퍼 B
      moisture REAL,                    -- 수분
      worker TEXT,                      -- 작업자
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_qc_date_shift ON qc_test(date, shift);
    CREATE INDEX IF NOT EXISTS idx_prod_date ON production_log(date);

    CREATE TABLE IF NOT EXISTS spec_limit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL UNIQUE,      -- 'hardness' | 'moisture' | 'gas_per_hour'
      min_value REAL,
      max_value REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 로그인 시도 제한(무차별 대입 방지). 예전에는 서버 메모리(Map)에만 있어서 재배포할
    -- 때마다 초기화됐는데, 여기로 옮겨서 재배포와 무관하게 잠금 상태가 유지되게 한다.
    CREATE TABLE IF NOT EXISTS login_attempt (
      key TEXT PRIMARY KEY,       -- 'admin' 또는 'site:<아이디>'
      count INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0, -- epoch ms, 0이면 잠기지 않음
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 오프사이트(R2) 백업으로 이미 올린 첨부파일을 기록해, 매번 전체를 다시 올리지
    -- 않고 아직 안 올린 파일만 골라 올릴 수 있게 한다.
    CREATE TABLE IF NOT EXISTS offsite_upload_log (
      file_path TEXT PRIMARY KEY,  -- data/attachments/ 기준 상대경로 (board/..., documents/...)
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT,
      session_secret TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS electricity_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,               -- YYYY-MM-DD
      plant TEXT NOT NULL,              -- '1공장' | '2공장'
      voltage_type TEXT NOT NULL,       -- '저압' | '고압'
      usage_kwh REAL,                   -- 일일 사용량(kWh)
      source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'api'
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, plant)
    );

    CREATE INDEX IF NOT EXISTS idx_electricity_date ON electricity_usage(date);

    -- 월별 유틸리티 청구/사용 데이터 (전력·LNG 금액, 경유 사용량·금액).
    -- 사용량(kWh, ㎥)·생산량(ton)은 일별 데이터에서 자동 합산되지만, 과거 이력이나
    -- 청구 금액처럼 일별로 잡히지 않는 값은 여기에 직접 저장/보정한다.
    CREATE TABLE IF NOT EXISTS monthly_utility (
      month TEXT PRIMARY KEY,            -- YYYY-MM
      elec1_kwh REAL,                   -- 1공장 전력 사용량(kWh)
      elec1_won REAL,                   -- 1공장 전력 금액(원)
      elec2_kwh REAL,                   -- 2공장 전력 사용량(kWh)
      elec2_won REAL,                   -- 2공장 전력 금액(원)
      lng_m3 REAL,                      -- LNG 사용량(㎥) (구버전, lng_dryer_m3/lng_rto_m3로 대체됨)
      lng_won REAL,                     -- LNG 금액(원) (구버전, lng_dryer_won/lng_rto_won로 대체됨)
      lng_dryer_m3 REAL,                -- 건조로 LNG 사용량(㎥) - 실청구금액 입력에서 입력
      lng_dryer_won REAL,               -- 건조로 LNG 금액(원) - 실청구금액 입력에서 입력
      lng_rto_m3 REAL,                  -- RTO LNG 사용량(㎥) - 실청구금액 입력에서 입력
      lng_rto_won REAL,                 -- RTO LNG 금액(원) - 실청구금액 입력에서 입력
      diesel_liter REAL,               -- 경유 사용량(ℓ)
      diesel_won REAL,                  -- 경유 금액(원)
      production_ton REAL,             -- 생산량(ton) 보정값(비우면 일별 합산 사용)
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 입력/수정 이력 통합 로그. 각 데이터 화면에서 저장할 때마다 한 줄씩 남는다.
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,        -- 'production_log' | 'qc_test' | 'electricity_usage' | 'monthly_utility' | 'packing_*'
      record_key TEXT NOT NULL,        -- 사람이 알아볼 수 있는 식별자 (예: "2026-07-19 주", "2026-07 1공장")
      action TEXT NOT NULL,            -- 'create' | 'update' | 'delete'
      actor TEXT NOT NULL,             -- 입력/수정한 사람 이름
      summary TEXT,                    -- 무엇이 바뀌었는지 간단한 설명
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

    -- ---------- 제품포장(재고관리) ----------
    CREATE TABLE IF NOT EXISTS packing_item (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,               -- 'product' | 'bagmat' | 'aux'
      category TEXT,                    -- 대분류 (예: 석회고토, 입상규산) - product만 사용
      sub TEXT,                         -- 세부 항목명
      unit TEXT,                        -- '포' | '톤' | '개' 등
      bag_kg REAL,                      -- 포대/톤백 단위 중량(kg)
      bag_mat_key TEXT,                 -- 이 제품 포장 시 소모되는 포장지 품목 key
      stock REAL NOT NULL DEFAULT 0,    -- 현재 재고 수량
      cumulative_produced REAL NOT NULL DEFAULT 0  -- 생산누계(역대 총 생산량, product만 사용)
    );

    CREATE TABLE IF NOT EXISTS packing_entry (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,               -- 'pack' | 'ship'
      product_key TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT,
      topsheet_key TEXT, topsheet_qty REAL,
      wrap_key TEXT, wrap_qty REAL,
      bag_mat_key TEXT, bag_mat_qty REAL,
      aux_use_key TEXT, aux_use_qty REAL,
      worker TEXT,                      -- 작업자 (production_log.worker와 동일 개념)
      entered_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_packing_entry_date ON packing_entry(date);

    CREATE TABLE IF NOT EXISTS packing_restock (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      kind TEXT,
      key TEXT NOT NULL,
      qty REAL NOT NULL,
      worker TEXT,
      entered_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_packing_restock_date ON packing_restock(date);

    CREATE TABLE IF NOT EXISTS packing_breakage (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      kind TEXT,
      key TEXT NOT NULL,
      qty REAL NOT NULL,
      worker TEXT,
      entered_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_packing_breakage_date ON packing_breakage(date);

    CREATE TABLE IF NOT EXISTS packing_return (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      kind TEXT,
      key TEXT NOT NULL,
      qty REAL NOT NULL,
      worker TEXT,
      entered_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_packing_return_date ON packing_return(date);

    CREATE TABLE IF NOT EXISTS packing_adjustment (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      kind TEXT,
      key TEXT NOT NULL,
      qty REAL NOT NULL,                -- 부호 있는 증감값
      reason TEXT,
      entered_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_packing_adjustment_date ON packing_adjustment(date);

    -- ---------- 원재료관리 ----------
    CREATE TABLE IF NOT EXISTS raw_material (
      key TEXT PRIMARY KEY,               -- 코드 (예: A01)
      name TEXT NOT NULL,                 -- 원재료명
      form TEXT NOT NULL DEFAULT 'solid', -- 'solid'(고상) | 'liquid'(액상)
      category TEXT,
      unit TEXT,
      submit_to TEXT,                     -- 제출처
      last_price REAL,                    -- 최근 단가 (입고입력 기본값으로 자동 채워짐)
      stock REAL NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      entered_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS raw_material_supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      phone TEXT,
      entered_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS raw_material_inbound (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      material_key TEXT NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT,          -- 입력 시점 공급처명 스냅샷
      qty REAL NOT NULL,
      unit TEXT,
      unit_price REAL,
      amount REAL,
      vehicle_no TEXT,             -- 비고(차량번호)
      judgment TEXT NOT NULL DEFAULT 'OK', -- 'OK' | 'NG'
      problem TEXT,
      reason TEXT,
      action_taken TEXT,
      judged_by TEXT,
      locked INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      entered_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_raw_material_inbound_date ON raw_material_inbound(date);
    CREATE INDEX IF NOT EXISTS idx_raw_material_inbound_material ON raw_material_inbound(material_key);

    CREATE TABLE IF NOT EXISTS raw_material_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_key TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      old_price REAL,
      new_price REAL NOT NULL,
      changed_by TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_raw_material_price_history_key ON raw_material_price_history(material_key);

    -- 양식출력에서 저장한 문서(성적서 발급 이력처럼 다시 조회/다운로드 가능)
    CREATE TABLE IF NOT EXISTS raw_material_document (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL,      -- 'form19_2' | 'form40' | 'inbound_certificate' | 'product_certificate'
      title TEXT,
      target_material TEXT,
      period_from TEXT,
      period_to TEXT,
      data_json TEXT NOT NULL,     -- 생성 시점 데이터 스냅샷(JSON)
      memo TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_raw_material_document_created ON raw_material_document(created_at);

    -- 개인별 계정 (아이디/비밀번호 + 조회/입력 권한). 관리자 비밀번호(admin_auth)와는 별개.
    CREATE TABLE IF NOT EXISTS user_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,               -- 'viewer' | 'editor'
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 모듈별 대분류 권한 (대분류 수준에서 해당 모듈의 모든 기능에 동일하게 적용)
    CREATE TABLE IF NOT EXISTS module_permission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
      module TEXT NOT NULL,             -- '시스템관리' | '근태관리' | '생산관리' 등
      can_view INTEGER NOT NULL DEFAULT 0,   -- 1: 조회 가능
      can_create INTEGER NOT NULL DEFAULT 0, -- 1: 입력 가능
      can_update INTEGER NOT NULL DEFAULT 0, -- 1: 수정 가능
      can_delete INTEGER NOT NULL DEFAULT 0, -- 1: 삭제 가능
      is_hidden INTEGER NOT NULL DEFAULT 0,  -- 1: 화면에 표시 안 함
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, module)
    );
    CREATE INDEX IF NOT EXISTS idx_module_permission_user ON module_permission(user_id);

    -- 근로자명부 (생산/출하 입력 등에서 작업자를 드롭다운으로 선택하기 위한 목록)
    CREATE TABLE IF NOT EXISTS worker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 근태 신청 (연차/반차/외출/조퇴 등)
    CREATE TABLE IF NOT EXISTS leave_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      worker_name TEXT NOT NULL,
      type TEXT NOT NULL,                 -- '연차' | '반차(오전)' | '반차(오후)' | '외출' | '조퇴'
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 0,       -- 연차 차감 일수 (외출/조퇴는 0)
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
      requested_by TEXT NOT NULL,
      decided_by TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_leave_request_worker ON leave_request(worker_id);

    -- 연차 마스터 (연도별 발생연차/전년도 이월연차, 관리자 입력·엑셀업로드)
    CREATE TABLE IF NOT EXISTS leave_balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      hire_date TEXT,
      accrued_days REAL NOT NULL DEFAULT 0,
      carried_over_days REAL NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(worker_id, year)
    );

    -- 게시판 (생산계획/보수계획/휴무일 등 공지)
    CREATE TABLE IF NOT EXISTS board_post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 첨부 원본 바이트는 DB가 아니라 파일(ATTACHMENTS_DIR)에 저장하고, file_path에는
    -- 그 상대경로만 넣는다 (백업 시 DB 파일이 첨부 용량만큼 비대해지는 것을 막기 위함).
    CREATE TABLE IF NOT EXISTS board_attachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES board_post(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_board_attachment_post ON board_attachment(post_id);

    -- 일일 출근부: 근무조(주간/야간)와, 본인 신청/승인 흐름이 없는 근태상태(주로 외국인 근로자)를
    -- 관리자가 날짜별로 직접 입력·수정한다.
    CREATE TABLE IF NOT EXISTS daily_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift TEXT,               -- 'day' | 'night' (비어있으면 주간을 기본값으로 사용)
      status TEXT,              -- 'early_leave' | 'comp_off' | 'late' | 'absent' | 'other' (없으면 정상출근)
      status_detail TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(worker_id, date)
    );

    -- 문서관리: 외부기관 시험성적서(test_report) / MSDS(msds) 공용 업로드 파일
    CREATE TABLE IF NOT EXISTS document_file (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT NOT NULL,          -- 'test_report' | 'msds'
      category TEXT NOT NULL,          -- '원료' | '제품'
      item_name TEXT NOT NULL,
      language TEXT,                   -- test_report만 사용: '국문' | '영문' | '기타'
      ref_date TEXT,                   -- test_report=시험일자, msds=개정일자 (YYYY-MM-DD)
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      entered_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_document_file_type ON document_file(doc_type, item_name);

    -- 자체시험성적서(수출용): 품목별 규격/비고 마스터 (품목 선택 시 자동입력용)
    CREATE TABLE IF NOT EXISTS self_test_item_spec (
      item_name TEXT PRIMARY KEY,
      specification TEXT,
      remarks TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 자체시험성적서 발행 이력
    CREATE TABLE IF NOT EXISTS self_test_certificate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_no TEXT,
      item_name TEXT NOT NULL,
      specification TEXT,
      remarks TEXT,
      result TEXT,
      language TEXT NOT NULL DEFAULT '국문',   -- '국문' | '영문'
      consignee TEXT,                          -- 발송처 (자유입력)
      issued_date TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_self_test_certificate_date ON self_test_certificate(issued_date);

    -- 연구실험일지: 항목형 / 자유기술형 / 외부시험연동형 공용
    CREATE TABLE IF NOT EXISTS lab_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_type TEXT NOT NULL,        -- '항목형' | '자유기술형' | '외부시험연동형'
      date TEXT NOT NULL,
      researcher TEXT,
      item_name TEXT,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,     -- 양식별 세부 데이터 (JSON)
      linked_report_id INTEGER REFERENCES document_file(id) ON DELETE SET NULL,
      entered_by TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lab_journal_date ON lab_journal(date);

    -- 탭 표시 여부 설정 (시스템 전체 사용자에게 일괄 적용)
    CREATE TABLE IF NOT EXISTS tab_visibility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL,      -- '생산관리' | '생산가동' | '생산/출하입력' 등
      feature TEXT NOT NULL,     -- 'backup' | 'maintenance' 등 - 탭 이름
      visible INTEGER NOT NULL DEFAULT 1, -- 1: 표시, 0: 숨김
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(module, feature)
    );
  `);

  // 기존에 만들어진 DB에도 새 컬럼이 안전하게 추가되도록 마이그레이션
  function migrateColumns(table: string, migrations: [string, string][]) {
    const cols = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    );
    for (const [col, type] of migrations) {
      if (!cols.has(col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    }
  }

  migrateColumns("production_log", [
    ["worker", "TEXT"],
    ["granulation_agent", "TEXT"],
    ["granulation_usage_per_min", "REAL"],
    ["downtime_hours", "REAL"],
    ["downtime_reason", "TEXT"],
    ["carryover_dryer", "REAL"],
    ["carryover_rto", "REAL"],
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["time", "TEXT"],
    ["sample_no", "TEXT"],
  ]);
  migrateColumns("qc_test", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
    ["measured_date", "TEXT"],
    ["measured_time", "TEXT"],
    ["moisture_note", "TEXT"],
    ["hopper_a", "REAL"],
    ["hopper_b", "REAL"],
  ]);
  migrateColumns("electricity_usage", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
  ]);
  migrateColumns("monthly_utility", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
    ["lng_dryer_m3", "REAL"],
    ["lng_dryer_won", "REAL"],
    ["lng_rto_m3", "REAL"],
    ["lng_rto_won", "REAL"],
  ]);
  migrateColumns("spec_limit", [["updated_by", "TEXT"]]);
  migrateColumns("packing_item", [
    ["cumulative_produced", "REAL NOT NULL DEFAULT 0"],
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
  ]);
  migrateColumns("packing_entry", [
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
  ]);
  migrateColumns("packing_restock", [
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
  ]);
  migrateColumns("packing_breakage", [
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
  ]);
  migrateColumns("packing_return", [
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
    ["approved_by", "TEXT"],
    ["approved_at", "TEXT"],
  ]);
  migrateColumns("user_account", [["worker_id", "INTEGER"]]);
  migrateColumns("board_post", [["pinned", "INTEGER NOT NULL DEFAULT 0"]]);
  migrateColumns("worker", [
    ["hire_date", "TEXT"],
    ["nationality", "TEXT NOT NULL DEFAULT 'domestic'"], // 'domestic' | 'foreign'
    ["birth_date", "TEXT"],
    ["foreign_country", "TEXT"], // 'cambodia' | 'nepal' (외국인일 때만 사용)
  ]);
  migrateColumns("raw_material_supplier", [["country", "TEXT"]]);
  migrateColumns("raw_material", [
    // 별지 제40호서식(유기농업자재 공시 원료·재료 수급대장) 발급용, 자재(품목)마다 고정되는 공시 정보
    ["disclosure_no", "TEXT"],
    ["disclosure_date", "TEXT"],
    ["material_type", "TEXT"],
    ["main_ingredients", "TEXT"],
    ["disclosure_valid_from", "TEXT"],
    ["disclosure_valid_to", "TEXT"],
  ]);

  migrateBoardAttachmentBlobsToFiles(db);
  migrateDocumentFileBlobsToFiles(db);
  repairLabJournalForeignKeyReference(db);

  const specCount = db.prepare("SELECT COUNT(*) as c FROM spec_limit").get() as { c: number };
  if (specCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO spec_limit (metric, min_value, max_value) VALUES (?, ?, ?)"
    );
    insert.run("hardness", 4, 12);
    insert.run("moisture", 1.5, 4);
    insert.run("gas_per_hour", 200, 450);
  }

  const packingItemCount = db.prepare("SELECT COUNT(*) as c FROM packing_item").get() as {
    c: number;
  };
  if (packingItemCount.c === 0) {
    const insertItem = db.prepare(
      "INSERT INTO packing_item (kind, key, category, sub, unit, bag_kg, bag_mat_key, stock) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
    );
    const initialItems: [string, string, string, string, string, number, string][] = [
      ["product", "sekhoego_musang", "석회고토", "무상분", "포", 20, "bm_sekhoego_musang"],
      ["product", "sekhoego_yusang", "석회고토", "유상분", "포", 20, "bm_sekhoego_yusang"],
      ["product", "sekhoego_saeng", "석회고토", "생생나라(유기농)", "포", 20, "bm_sekhoego_saeng"],
      ["product", "gyusan_musang", "입상규산", "무상분", "포", 20, "bm_gyusan_musang"],
      ["product", "gyusan_yusang", "입상규산", "유상분", "포", 20, "bm_gyusan_yusang"],
      ["product", "gyusan_saeng", "입상규산", "생생나라(유기농)", "포", 20, "bm_gyusan_saeng"],
      ["product", "calcium_yusang", "칼슘유황", "유상(백색)", "포", 20, "bm_calcium"],
      ["product", "tonbag_sekhoego", "톤백", "석회고토(1T)", "톤", 1000, ""],
      ["product", "tonbag_gyusan", "톤백", "규산(1T)", "톤", 1000, ""],
      ["product", "saengsaeng_vita", "생생비타", "기본", "개", 0, ""],
      ["bagmat", "bm_sekhoego_musang", "", "석회고토 무상분 포장지", "", 0, ""],
      ["bagmat", "bm_sekhoego_yusang", "", "석회고토 유상분 포장지", "", 0, ""],
      ["bagmat", "bm_sekhoego_saeng", "", "석회고토 생생나라(유기농) 포장지", "", 0, ""],
      ["bagmat", "bm_gyusan_musang", "", "입상규산 무상분 포장지", "", 0, ""],
      ["bagmat", "bm_gyusan_yusang", "", "입상규산 유상분 포장지", "", 0, ""],
      ["bagmat", "bm_gyusan_saeng", "", "입상규산 생생나라(유기농) 포장지", "", 0, ""],
      ["bagmat", "bm_calcium", "", "칼슘유황 유상(백색) 포장지", "", 0, ""],
      ["bagmat", "bm_tonbag_liner", "", "톤백 내피 有", "", 0, ""],
      ["bagmat", "bm_tonbag_noliner", "", "톤백 내피 無", "", 0, ""],
      ["aux", "topsheet_black", "", "탑시트(흑)", "", 0, ""],
      ["aux", "topsheet_white", "", "탑시트(백)", "", 0, ""],
      ["aux", "wrap_black", "", "스트레치필름(흑) [랩핑]", "", 0, ""],
      ["aux", "wrap_clear", "", "스트레치필름(투) [랩핑]", "", 0, ""],
      ["aux", "plt_wood", "", "목재PLT", "", 0, ""],
      ["aux", "plt_fumigation", "", "수출용 훈증PLT", "", 0, ""],
      ["aux", "plastic_10l", "", "10리터통", "", 0, ""],
      ["aux", "ibc_tank", "", "IBC TANK", "", 0, ""],
      ["aux", "bib", "", "BIB", "", 0, ""],
    ];
    for (const [kind, key, category, sub, unit, bagKg, bagMatKey] of initialItems) {
      insertItem.run(kind, key, category, sub, unit, bagKg, bagMatKey);
    }
  }

  const authRow = db.prepare("SELECT id FROM admin_auth WHERE id = 1").get();
  if (!authRow) {
    db.prepare("INSERT INTO admin_auth (id, password_hash, session_secret) VALUES (1, NULL, ?)").run(
      crypto.randomBytes(32).toString("hex")
    );
  }

  seedDisclosureRawMaterials(db);

  global.__db = db;
  return db;
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_setting WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function isTabVisible(module: string, feature: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT visible FROM tab_visibility WHERE module = ? AND feature = ?").get(module, feature) as
    | { visible: number }
    | undefined;
  // 기본값은 표시(1)
  return row ? row.visible === 1 : true;
}
