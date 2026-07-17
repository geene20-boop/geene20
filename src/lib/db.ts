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
  db.pragma("journal_mode = WAL");

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, shift)
    );

    CREATE TABLE IF NOT EXISTS qc_test (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_no INTEGER,
      fertilizer_type TEXT,
      date TEXT NOT NULL,               -- YYYY-MM-DD
      shift TEXT NOT NULL,              -- '주' | '야' (테스트 시각 기준 자동/수기 지정)
      time TEXT,                        -- HH:MM
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
  `);

  // 기존에 만들어진 DB에도 새 컬럼이 안전하게 추가되도록 마이그레이션
  const existingCols = new Set(
    (db.prepare("PRAGMA table_info(production_log)").all() as { name: string }[]).map((c) => c.name)
  );
  const migrations: [string, string][] = [
    ["worker", "TEXT"],
    ["granulation_agent", "TEXT"],
    ["granulation_usage_per_min", "REAL"],
    ["downtime_hours", "REAL"],
    ["carryover_dryer", "REAL"],
    ["carryover_rto", "REAL"],
  ];
  for (const [col, type] of migrations) {
    if (!existingCols.has(col)) {
      db.exec(`ALTER TABLE production_log ADD COLUMN ${col} ${type}`);
    }
  }

  const specCount = db.prepare("SELECT COUNT(*) as c FROM spec_limit").get() as { c: number };
  if (specCount.c === 0) {
    const insert = db.prepare(
      "INSERT INTO spec_limit (metric, min_value, max_value) VALUES (?, ?, ?)"
    );
    insert.run("hardness", 4, 12);
    insert.run("moisture", 1.5, 4);
    insert.run("gas_per_hour", 200, 450);
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
