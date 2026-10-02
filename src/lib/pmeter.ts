import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { Plant, PLANT_OPTIONS, PLANT_VOLTAGE } from "@/lib/types";

const ACTOR = "한전 API 자동연동";
const CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_HOUR_KST = 8;

const DAY_LP_DATA_URL = "https://opm.kepco.co.kr:11080/OpenAPI/getDayLpData.do";

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
 * Open P-Meter "일단위 전력소비 데이터(일반, getDayLpData)" 조회.
 * 15분 단위 하루치 96개 값(pwr_qty0015~pwr_qty2400)을 모두 더해 하루 총 사용량을 구한다.
 * (vld_pwr는 저압 계기의 누적 지침값이라 고압 공장에는 제공되지 않아 사용하지 않음)
 */
async function fetchDailyUsageKwh(custNo: string, date: string): Promise<number | null> {
  const apiKey = process.env.KEPCO_PMETER_API_KEY;
  if (!apiKey) return null;

  const url = new URL(DAY_LP_DATA_URL);
  url.searchParams.set("custNo", custNo);
  url.searchParams.set("date", date.replace(/-/g, ""));
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("returnType", "02");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open P-Meter API 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const entries = data?.dayLpDataInfoList;
  if (!Array.isArray(entries) || entries.length === 0) {
    // 한전 API는 서비스키 만료/차단, 조회건수 초과 등의 오류도 HTTP 200과 함께 내려주는
    // 경우가 있다. dayLpDataInfoList가 없다고 해서 무조건 "그 날짜에 데이터가 없다"고
    // 단정하면 이런 오류를 조용히 "조회된 값 없음"으로 삼켜버리게 되므로, 응답에 담긴
    // 오류로 보이는 필드가 있으면 실제 오류로 취급해 화면에 드러낸다.
    const errorField = Object.entries((data ?? {}) as Record<string, unknown>).find(
      ([key, value]) =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        /error|err_?msg|result_?(code|msg)|return_?(auth|reason)|fault|message|code/i.test(key)
    );
    if (errorField) {
      const [key, value] = errorField;
      throw new Error(`Open P-Meter API 오류 응답 (${key}: ${value})`);
    }
    console.error("한전 Open P-Meter: dayLpDataInfoList 없는 응답", JSON.stringify(data).slice(0, 500));
    return null;
  }

  let total = 0;
  let found = false;
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (/^pwr_qty\d{4}$/.test(key)) {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          total += num;
          found = true;
        }
      }
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
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

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** fromDate~toDate(둘 다 포함, YYYY-MM-DD) 구간을 1공장·2공장 각각 동기화한다. 자동 동기화가 며칠 밀렸을 때 수동으로 보충하는 용도. */
export async function runPmeterSyncForRange(fromDate: string, toDate: string): Promise<PmeterSyncResult[]> {
  const results: PmeterSyncResult[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    for (const plant of PLANT_OPTIONS) {
      results.push(await syncPlantUsage(plant, date));
    }
  }
  return results;
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
