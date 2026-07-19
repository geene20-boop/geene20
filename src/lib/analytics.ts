import { getDb } from "@/lib/db";
import {
  ProductionLog,
  QcTest,
  qcAvg,
  ElectricityUsage,
  MonthlyUtility,
  UtilityMonthRow,
} from "@/lib/types";

export interface MergedShiftRow {
  date: string;
  shift: "주" | "야";
  production: ProductionLog | null;
  qcTests: QcTest[];
  qcHardnessAvg: number | null;
  qcMoistureAvg: number | null;
  qcBrixAvg: number | null;
  hardness: number | null; // manual override > qc avg
  moisture: number | null;
  gasPerHour: number | null;
  alerts: Alert[];
}

export interface Alert {
  level: "warning" | "critical";
  metric: string;
  message: string;
}

function avg(nums: (number | null | undefined)[]): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function getSpecLimits() {
  const db = getDb();
  const rows = db.prepare("SELECT metric, min_value, max_value FROM spec_limit").all() as {
    metric: string;
    min_value: number | null;
    max_value: number | null;
  }[];
  const map: Record<string, { min: number | null; max: number | null }> = {};
  for (const r of rows) map[r.metric] = { min: r.min_value, max: r.max_value };
  return map;
}

export function getMergedRows(fromDate: string, toDate: string): MergedShiftRow[] {
  const db = getDb();
  const productions = db
    .prepare("SELECT * FROM production_log WHERE date BETWEEN ? AND ? ORDER BY date, shift DESC")
    .all(fromDate, toDate) as ProductionLog[];
  const qcTests = db
    .prepare("SELECT * FROM qc_test WHERE date BETWEEN ? AND ? ORDER BY date, time")
    .all(fromDate, toDate) as QcTest[];

  const specs = getSpecLimits();

  const keyOf = (date: string, shift: string) => `${date}__${shift}`;
  const qcByKey = new Map<string, QcTest[]>();
  for (const t of qcTests) {
    const k = keyOf(t.date, t.shift);
    if (!qcByKey.has(k)) qcByKey.set(k, []);
    qcByKey.get(k)!.push(t);
  }

  const prodByKey = new Map<string, ProductionLog>();
  for (const p of productions) prodByKey.set(keyOf(p.date, p.shift), p);

  const allKeys = new Set<string>([...qcByKey.keys(), ...prodByKey.keys()]);

  const rows: MergedShiftRow[] = [];
  for (const key of allKeys) {
    const [date, shift] = key.split("__") as [string, "주" | "야"];
    const production = prodByKey.get(key) ?? null;
    const tests = qcByKey.get(key) ?? [];

    const qcHardnessAvg = avg(tests.map((t) => qcAvg(t)));
    const qcMoistureAvg = avg(tests.map((t) => t.moisture));
    const qcBrixAvg = avg(tests.map((t) => t.granulation_brix));

    const hardness = production?.hardness_manual ?? qcHardnessAvg;
    const moisture = production?.moisture_manual ?? qcMoistureAvg;

    const gasPerHour =
      production?.gas_usage_shift && production?.line_hours_total
        ? production.gas_usage_shift / production.line_hours_total
        : null;

    const alerts: Alert[] = [];

    if (hardness != null && specs.hardness) {
      if (specs.hardness.min != null && hardness < specs.hardness.min) {
        alerts.push({
          level: "critical",
          metric: "hardness",
          message: `경도 평균 ${hardness.toFixed(2)}이(가) 하한 ${specs.hardness.min} 미만입니다.`,
        });
      } else if (specs.hardness.max != null && hardness > specs.hardness.max) {
        alerts.push({
          level: "warning",
          metric: "hardness",
          message: `경도 평균 ${hardness.toFixed(2)}이(가) 상한 ${specs.hardness.max} 초과입니다.`,
        });
      }
    }

    if (moisture != null && specs.moisture) {
      if (specs.moisture.min != null && moisture < specs.moisture.min) {
        alerts.push({
          level: "warning",
          metric: "moisture",
          message: `수분 평균 ${moisture.toFixed(2)}이(가) 하한 ${specs.moisture.min} 미만입니다.`,
        });
      } else if (specs.moisture.max != null && moisture > specs.moisture.max) {
        alerts.push({
          level: "critical",
          metric: "moisture",
          message: `수분 평균 ${moisture.toFixed(2)}이(가) 상한 ${specs.moisture.max} 초과입니다.`,
        });
      }
    }

    if (gasPerHour != null && specs.gas_per_hour) {
      if (specs.gas_per_hour.max != null && gasPerHour > specs.gas_per_hour.max) {
        alerts.push({
          level: "warning",
          metric: "gas_per_hour",
          message: `가동시간당 가스사용량 ${gasPerHour.toFixed(1)}㎥/h가 기준 ${specs.gas_per_hour.max} 초과입니다.`,
        });
      }
    }

    rows.push({
      date,
      shift,
      production,
      qcTests: tests,
      qcHardnessAvg,
      qcMoistureAvg,
      qcBrixAvg,
      hardness,
      moisture,
      gasPerHour,
      alerts,
    });
  }

  rows.sort((a, b) => (a.date + a.shift < b.date + b.shift ? 1 : -1));
  return rows;
}

function granulationUsageTotal(p: ProductionLog | null): number | null {
  if (!p || p.granulation_usage_per_min == null || p.line_hours_total == null) return null;
  return p.granulation_usage_per_min * p.line_hours_total * 60;
}

export interface DailySheetShift {
  shift: "주" | "야";
  worker: string | null;
  downtimeHours: number | null;
  lineHoursTotal: number | null;
  granulationAgent: string | null;
  granulationUsageTotal: number | null;
  gasUsageShift: number | null;
  packAmount: number | null;
}

export interface DailySheetRow {
  date: string;
  shifts: DailySheetShift[];
  dayTotal: {
    downtimeHours: number;
    lineHoursTotal: number;
    granulationUsageTotal: number;
    gasUsageShift: number;
    packAmount: number;
  };
  deltaFromPrevDay: {
    granulationUsageTotal: number | null;
    gasUsageShift: number | null;
  };
}

function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function getMonthlyDailySheet(month: string): DailySheetRow[] {
  const from = addDays(`${month}-01`, -1);
  const to = daysInMonth(month).slice(-1)[0] ?? `${month}-28`;
  const rows = getMergedRows(from, to);

  const byDate = new Map<string, MergedShiftRow[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const dayTotalFor = (date: string) => {
    const dayRows = byDate.get(date) ?? [];
    return {
      downtimeHours: dayRows.reduce((s, r) => s + (r.production?.downtime_hours ?? 0), 0),
      lineHoursTotal: dayRows.reduce((s, r) => s + (r.production?.line_hours_total ?? 0), 0),
      granulationUsageTotal: dayRows.reduce((s, r) => s + (granulationUsageTotal(r.production) ?? 0), 0),
      gasUsageShift: dayRows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0),
      packAmount: dayRows.reduce((s, r) => s + (r.production?.daily_pack_amount ?? 0), 0),
    };
  };

  const result: DailySheetRow[] = [];
  for (const date of daysInMonth(month)) {
    const dayRows = (byDate.get(date) ?? []).sort((a) => (a.shift === "주" ? -1 : 1));
    const shifts: DailySheetShift[] = dayRows.map((r) => ({
      shift: r.shift,
      worker: r.production?.worker ?? null,
      downtimeHours: r.production?.downtime_hours ?? null,
      lineHoursTotal: r.production?.line_hours_total ?? null,
      granulationAgent: r.production?.granulation_agent ?? null,
      granulationUsageTotal: granulationUsageTotal(r.production),
      gasUsageShift: r.production?.gas_usage_shift ?? null,
      packAmount: r.production?.daily_pack_amount ?? null,
    }));

    const dayTotal = dayTotalFor(date);
    const prevTotal = dayTotalFor(addDays(date, -1));
    const hasPrevData = (byDate.get(addDays(date, -1)) ?? []).length > 0;

    result.push({
      date,
      shifts,
      dayTotal,
      deltaFromPrevDay: {
        granulationUsageTotal: hasPrevData
          ? dayTotal.granulationUsageTotal - prevTotal.granulationUsageTotal
          : null,
        gasUsageShift: hasPrevData ? dayTotal.gasUsageShift - prevTotal.gasUsageShift : null,
      },
    });
  }

  return result;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  totalPackAmount: number;
  totalGasUsage: number;
  avgHardness: number | null;
  avgMoisture: number | null;
  avgGasPerHour: number | null;
  totalLineHours: number;
  alertCount: number;
  criticalCount: number;
}

export function getMonthlySummary(month: string): MonthlySummary {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const rows = getMergedRows(from, to);

  const totalPackAmount = rows.reduce((s, r) => s + (r.production?.daily_pack_amount ?? 0), 0);
  const totalGasUsage = rows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0);
  const totalLineHours = rows.reduce((s, r) => s + (r.production?.line_hours_total ?? 0), 0);
  const avgHardness = avg(rows.map((r) => r.hardness));
  const avgMoisture = avg(rows.map((r) => r.moisture));
  const avgGasPerHour = avg(rows.map((r) => r.gasPerHour));
  const allAlerts = rows.flatMap((r) => r.alerts);

  return {
    month,
    totalPackAmount,
    totalGasUsage,
    avgHardness,
    avgMoisture,
    avgGasPerHour,
    totalLineHours,
    alertCount: allAlerts.length,
    criticalCount: allAlerts.filter((a) => a.level === "critical").length,
  };
}

// ---------- 월별 유틸리티 통합 시트 ----------

function ratio(numer: number | null, denom: number | null): number | null {
  if (numer == null || denom == null || denom === 0) return null;
  return numer / denom;
}

function sumOrNull(...vals: (number | null)[]): number | null {
  const present = vals.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

/** fromMonth, toMonth (YYYY-MM) 사이의 월 목록을 반환 (양끝 포함) */
export function monthsInRange(fromMonth: string, toMonth: string): string[] {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  const result: string[] = [];
  let y = fy;
  let m = fm;
  // 안전장치: 최대 120개월(10년)
  for (let i = 0; i < 120; i++) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y === ty && m === tm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

interface MonthRawAgg {
  elec1Kwh: number | null;
  elec2Kwh: number | null;
  lngM3: number | null;
  productionTon: number | null;
  productionByProduct: Record<string, number>;
  elecByProduct: Record<string, number>;
  lngByProduct: Record<string, number>;
}

/** 한 달의 일별 데이터를 집계 (전력 공장별, LNG, 비종별 생산량/전력/가스 배분) */
function aggregateMonthDaily(month: string): MonthRawAgg {
  const db = getDb();
  const from = `${month}-01`;
  const to = `${month}-31`;

  const prod = db
    .prepare("SELECT * FROM production_log WHERE date BETWEEN ? AND ?")
    .all(from, to) as ProductionLog[];
  const elec = db
    .prepare("SELECT * FROM electricity_usage WHERE date BETWEEN ? AND ?")
    .all(from, to) as ElectricityUsage[];

  // 전력: 공장별 합산
  let elec1 = 0;
  let elec2 = 0;
  let elecCount = 0;
  const elecByDate = new Map<string, number>();
  for (const e of elec) {
    if (e.usage_kwh == null) continue;
    elecCount++;
    if (e.plant === "1공장") elec1 += e.usage_kwh;
    else if (e.plant === "2공장") elec2 += e.usage_kwh;
    elecByDate.set(e.date, (elecByDate.get(e.date) ?? 0) + e.usage_kwh);
  }

  // 생산량: 비종별 + 총합, 그리고 날짜별 생산 비종 목록
  const productionByProduct: Record<string, number> = {};
  let productionTon = 0;
  let prodCount = 0;
  const productsByDate = new Map<string, Set<string>>();
  const lngByProduct: Record<string, number> = {};
  let lngTotal = 0;
  let lngCount = 0;
  for (const p of prod) {
    if (p.daily_pack_amount != null) {
      productionTon += p.daily_pack_amount;
      prodCount++;
    }
    const prd = p.product ?? "미지정";
    if (p.daily_pack_amount != null) {
      productionByProduct[prd] = (productionByProduct[prd] ?? 0) + p.daily_pack_amount;
    }
    if (!productsByDate.has(p.date)) productsByDate.set(p.date, new Set());
    if (p.product) productsByDate.get(p.date)!.add(p.product);
    // LNG(가스): 조별 사용량을 그 조의 비종에 귀속
    if (p.gas_usage_shift != null) {
      lngTotal += p.gas_usage_shift;
      lngCount++;
      lngByProduct[prd] = (lngByProduct[prd] ?? 0) + p.gas_usage_shift;
    }
  }

  // 전력을 그날 생산한 비종에 배분 (여러 비종이면 균등 분할)
  const elecByProduct: Record<string, number> = {};
  for (const [date, kwh] of elecByDate) {
    const products = productsByDate.get(date);
    if (!products || products.size === 0) {
      elecByProduct["미지정"] = (elecByProduct["미지정"] ?? 0) + kwh;
    } else {
      const share = kwh / products.size;
      for (const prd of products) {
        elecByProduct[prd] = (elecByProduct[prd] ?? 0) + share;
      }
    }
  }

  return {
    elec1Kwh: elecCount > 0 ? elec1 : null,
    elec2Kwh: elecCount > 0 ? elec2 : null,
    lngM3: lngCount > 0 ? lngTotal : null,
    productionTon: prodCount > 0 ? productionTon : null,
    productionByProduct,
    elecByProduct,
    lngByProduct,
  };
}

/** 월별 유틸리티 통합 시트: 전력·LNG·경유 사용량/금액/단가, 비종별, 톤당 지표 */
export function getUtilityMonthlySheet(months: string[]): UtilityMonthRow[] {
  const db = getDb();
  const utilByMonth = new Map<string, MonthlyUtility>();
  if (months.length > 0) {
    const rows = db
      .prepare(
        `SELECT * FROM monthly_utility WHERE month IN (${months.map(() => "?").join(",")})`
      )
      .all(...months) as MonthlyUtility[];
    for (const r of rows) utilByMonth.set(r.month, r);
  }

  return months.map((month) => {
    const agg = aggregateMonthDaily(month);
    const u = utilByMonth.get(month);

    // 사용량: 월별 보정값 우선, 없으면 일별 합산
    const elec1Kwh = u?.elec1_kwh ?? agg.elec1Kwh;
    const elec2Kwh = u?.elec2_kwh ?? agg.elec2Kwh;
    const elecTotalKwh = sumOrNull(elec1Kwh, elec2Kwh);
    const elec1Won = u?.elec1_won ?? null;
    const elec2Won = u?.elec2_won ?? null;
    const elecTotalWon = sumOrNull(elec1Won, elec2Won);

    const lngM3 = u?.lng_m3 ?? agg.lngM3;
    const lngWon = u?.lng_won ?? null;

    const dieselLiter = u?.diesel_liter ?? null;
    const dieselWon = u?.diesel_won ?? null;

    const productionTon = u?.production_ton ?? agg.productionTon;

    const utilityWonTotal = sumOrNull(elecTotalWon, lngWon, dieselWon);

    return {
      month,
      elec1Kwh,
      elec1Won,
      elec2Kwh,
      elec2Won,
      elecTotalKwh,
      elecTotalWon,
      elecUnitPrice: ratio(elecTotalWon, elecTotalKwh),
      lngM3,
      lngWon,
      lngUnitPrice: ratio(lngWon, lngM3),
      dieselLiter,
      dieselWon,
      dieselUnitPrice: ratio(dieselWon, dieselLiter),
      productionTon,
      productionByProduct: agg.productionByProduct,
      elecPerTon: ratio(elecTotalKwh, productionTon),
      lngPerTon: ratio(lngM3, productionTon),
      dieselPerTon: ratio(dieselLiter, productionTon),
      utilityWonTotal,
      utilityWonPerTon: ratio(utilityWonTotal, productionTon),
      elecByProduct: agg.elecByProduct,
      lngByProduct: agg.lngByProduct,
    };
  });
}

/** 전년동월 대비: 각 월과 12개월 전 월을 짝지어 증감 계산 */
export interface YoYRow {
  month: string; // 이번 달 YYYY-MM
  current: UtilityMonthRow;
  prevYear: UtilityMonthRow | null;
  elecKwhDelta: number | null;
  elecKwhPct: number | null;
  lngM3Delta: number | null;
  lngM3Pct: number | null;
  dieselDelta: number | null;
  dieselPct: number | null;
}

function shiftMonth(month: string, deltaMonths: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function getUtilityYoY(months: string[]): YoYRow[] {
  const prevMonths = months.map((m) => shiftMonth(m, -12));
  const allMonths = Array.from(new Set([...months, ...prevMonths]));
  const sheet = getUtilityMonthlySheet(allMonths);
  const byMonth = new Map(sheet.map((r) => [r.month, r]));

  const pctDelta = (cur: number | null, prev: number | null): number | null => {
    if (cur == null || prev == null || prev === 0) return null;
    return (cur - prev) / prev;
  };
  const absDelta = (cur: number | null, prev: number | null): number | null => {
    if (cur == null || prev == null) return null;
    return cur - prev;
  };

  return months.map((month) => {
    const current = byMonth.get(month)!;
    const prevYear = byMonth.get(shiftMonth(month, -12)) ?? null;
    return {
      month,
      current,
      prevYear,
      elecKwhDelta: absDelta(current.elecTotalKwh, prevYear?.elecTotalKwh ?? null),
      elecKwhPct: pctDelta(current.elecTotalKwh, prevYear?.elecTotalKwh ?? null),
      lngM3Delta: absDelta(current.lngM3, prevYear?.lngM3 ?? null),
      lngM3Pct: pctDelta(current.lngM3, prevYear?.lngM3 ?? null),
      dieselDelta: absDelta(current.dieselLiter, prevYear?.dieselLiter ?? null),
      dieselPct: pctDelta(current.dieselLiter, prevYear?.dieselLiter ?? null),
    };
  });
}
