export type Shift = "주" | "야";

export interface ProductionLog {
  id: number;
  date: string;
  shift: Shift;
  product: string | null;
  daily_pack_amount: number | null;
  dryer_temp_a: number | null;
  dryer_temp_b: number | null;
  feed_hopper_a: number | null;
  feed_hopper_b: number | null;
  feed_fine_powder: number | null;
  feed_mixer: number | null;
  feed_molder: number | null;
  feed_total: number | null;
  brix: number | null;
  line_hours_a: number | null;
  line_hours_b: number | null;
  line_hours_total: number | null;
  lng_dryer: number | null;
  lng_rto: number | null;
  gas_usage_shift: number | null;
  gas_usage_total: number | null;
  moisture_manual: number | null;
  hardness_manual: number | null;
  note: string | null;
  worker: string | null;
  granulation_agent: string | null;
  granulation_usage_per_min: number | null;
  downtime_hours: number | null;
  carryover_dryer: number | null;
  carryover_rto: number | null;
  created_at: string;
  updated_at: string;
}

export interface QcTest {
  id: number;
  sample_no: number | null;
  fertilizer_type: string | null;
  date: string;
  shift: Shift;
  time: string | null;
  v1: number | null; v2: number | null; v3: number | null; v4: number | null; v5: number | null;
  v6: number | null; v7: number | null; v8: number | null; v9: number | null; v10: number | null;
  v11: number | null; v12: number | null; v13: number | null; v14: number | null; v15: number | null;
  v16: number | null; v17: number | null; v18: number | null; v19: number | null; v20: number | null;
  burner_temp: number | null;
  granulation_brix: number | null;
  granulation_input: number | null;
  fine_powder: number | null;
  hopper: number | null;
  moisture: number | null;
  worker: string | null;
  created_at: string;
  updated_at: string;
}

export const QC_VALUE_KEYS = Array.from({ length: 20 }, (_, i) => `v${i + 1}` as keyof QcTest);

export function qcValues(t: Partial<QcTest>): number[] {
  return QC_VALUE_KEYS
    .map((k) => t[k])
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
}

export function qcSum(t: Partial<QcTest>): number {
  return qcValues(t).reduce((a, b) => a + b, 0);
}

export function qcAvg(t: Partial<QcTest>): number | null {
  const vals = qcValues(t);
  if (vals.length === 0) return null;
  return qcSum(t) / vals.length;
}

export function inferShift(time: string): Shift {
  const hour = Number(time.split(":")[0]);
  return hour >= 8 && hour < 20 ? "주" : "야";
}

export type Plant = "1공장" | "2공장";
export type VoltageType = "저압" | "고압";

export const PLANT_OPTIONS: Plant[] = ["1공장", "2공장"];

export const PLANT_VOLTAGE: Record<Plant, VoltageType> = {
  "1공장": "저압",
  "2공장": "고압",
};

export interface ElectricityUsage {
  id: number;
  date: string;
  plant: Plant;
  voltage_type: VoltageType;
  usage_kwh: number | null;
  source: "manual" | "api";
  note: string | null;
  created_at: string;
  updated_at: string;
}
