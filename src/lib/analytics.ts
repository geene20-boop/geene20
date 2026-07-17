import { getDb } from "@/lib/db";
import { ProductionLog, QcTest, qcAvg } from "@/lib/types";

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
