import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { Plant, PLANT_OPTIONS, PLANT_VOLTAGE } from "@/lib/types";

const ACTOR = "한전 API 자동연동";
const CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_HOUR_KST = 8;

const BASE_URL = process.env.KEPCO_PMETER_BASE_URL ?? "https://opm.kepco.co.kr/openapi/v1";
const USAGE_PATH = process.env.KEPCO_PMETER_USAGE_PATH ?? "/pwrUsage/daily";

function custNoFor(plant: Plant): string | null {
  const key = plant === "1공장" ? "KEPCO_PMETER_CUSTNO_PLANT1" : "KEPCO_PMETER_CUSTNO_PLANT2";
  return process.env[key] ?? null;
}

export function isPmeterConfigured(): boolean {
  return !!(process.env.KEPCO_PMETER_API_KEY && PLANT_OPTIONS.every((p) => custNoFor(p)));
}

/** 현재 KST 기준 벽시계 시각의 시(hour)와 날짜(YYYY-MM-DD)를 구한다. */
function kstNow(): { hour: number; date: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { hour: kst.getUTCHours(), date: kst.toISOString().slice(0, 10) };
}

function kstYesterday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

/**
 * Open P-Meter 사용량 조회 API 호출부. 한전에서 발급받은 정식 API 명세서와
 * 요청/응답 필드명이 다를 수 있어, 실제 연동 후 이 함수만 조정하면 되도록 분리해뒀다.
 */
async function fetchDailyUsageKwh(custNo: string, date: string): Promise<number | null> {
  const apiKey = process.env.KEPCO_PMETER_API_KEY;
  if (!apiKey) return null;

  const url = new URL(USAGE_PATH, BASE_URL);
  url.searchParams.set("custNo", custNo);
  url.searchParams.set("reqDate", date.replace(/-/g, ""));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Open P-Meter API 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const usage = data?.data?.[0]?.usekWh ?? data?.data?.usekWh ?? data?.usekWh;
  return typeof usage === "number" ? usage : null;
}

export interface PmeterSyncResult {
  plant: Plant;
  date: string;
  usage_kwh: number | null;
  status: "saved" | "skipped_manual" | "no_data" | "error";
  error?: string;
}

/** 한 공장의 특정 날짜 사용량을 조회해 저장한다. 같은 날짜에 수동 입력이 이미 있으면 덮어쓰지 않는다. */
export async function syncPlantUsage(plant: Plant, date: string): Promise<PmeterSyncResult> {
  const custNo = custNoFor(plant);
  if (!custNo) {
    return { plant, date, usage_kwh: null, status: "error", error: "고객번호가 설정되지 않았습니다." };
  }

  let usageKwh: number | null;
  try {
    usageKwh = await fetchDailyUsageKwh(custNo, date);
  } catch (err) {
    return { plant, date, usage_kwh: null, status: "error", error: (err as Error).message };
  }
  if (usageKwh == null) {
    return { plant, date, usage_kwh: null, status: "no_data" };
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id, source FROM electricity_usage WHERE date = ? AND plant = ?")
    .get(date, plant) as { id: number; source: string } | undefined;
  if (existing && existing.source !== "api") {
    return { plant, date, usage_kwh: usageKwh, status: "skipped_manual" };
  }

  db.prepare(
    `INSERT INTO electricity_usage (date, plant, voltage_type, usage_kwh, source, entered_by, updated_by)
     VALUES (?, ?, ?, ?, 'api', ?, ?)
     ON CONFLICT(date, plant) DO UPDATE SET
       usage_kwh = excluded.usage_kwh,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')
     WHERE electricity_usage.source = 'api'`
  ).run(date, plant, PLANT_VOLTAGE[plant], usageKwh, ACTOR, ACTOR);

  logAudit(
    "electricity_usage",
    `${date} ${plant}`,
    existing ? "update" : "create",
    ACTOR,
    `${usageKwh}kWh (자동)`
  );
  return { plant, date, usage_kwh: usageKwh, status: "saved" };
}

/** 전일(어제, KST 기준) 사용량을 1공장·2공장 각각 동기화한다. */
export async function runDailyPmeterSync(): Promise<PmeterSyncResult[]> {
  const date = kstYesterday();
  const results: PmeterSyncResult[] = [];
  for (const plant of PLANT_OPTIONS) {
    results.push(await syncPlantUsage(plant, date));
  }
  return results;
}

declare global {
  var __pmeterTimer: NodeJS.Timeout | undefined;
  var __pmeterLastRunDate: string | undefined;
}

export function ensurePmeterScheduler(): void {
  if (!isPmeterConfigured()) return;
  if (global.__pmeterTimer) return;
  global.__pmeterTimer = setInterval(() => {
    const { hour, date } = kstNow();
    if (hour === SYNC_HOUR_KST && global.__pmeterLastRunDate !== date) {
      global.__pmeterLastRunDate = date;
      runDailyPmeterSync().catch((err) => {
        console.error("한전 Open P-Meter 자동 동기화 실패:", err);
      });
    }
  }, CHECK_INTERVAL_MS);
}
