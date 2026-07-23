import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (global.__db) return global.__db;

  const db = new Database(DB_PATH);
  // WAL은 mmap/파일 잠금을 정교하게 지원하는 로컬 디스크가 필요하다.
  // Railway 등 네트워크 볼륨에서는 WAL이 네이티브 모듈을 크래시시킬 수 있어 DELETE 저널을 사용한다.
  db.pragma("journal_mode = DELETE");

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
      hopper REAL,                      -- 생산조건 - 호퍼
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
      lng_m3 REAL,                      -- LNG 사용량(㎥)
      lng_won REAL,                     -- LNG 금액(원)
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

    -- 근로자명부 (생산/출하 입력 등에서 작업자를 드롭다운으로 선택하기 위한 목록)
    CREATE TABLE IF NOT EXISTS worker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    ["carryover_dryer", "REAL"],
    ["carryover_rto", "REAL"],
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
  ]);
  migrateColumns("qc_test", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
    ["measured_date", "TEXT"],
    ["measured_time", "TEXT"],
  ]);
  migrateColumns("electricity_usage", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
  ]);
  migrateColumns("monthly_utility", [
    ["entered_by", "TEXT"],
    ["updated_by", "TEXT"],
  ]);
  migrateColumns("spec_limit", [["updated_by", "TEXT"]]);
  migrateColumns("packing_item", [["cumulative_produced", "REAL NOT NULL DEFAULT 0"]]);

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
