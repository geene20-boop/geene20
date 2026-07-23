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
  downtime_reason: string | null;
  carryover_dryer: number | null;
  carryover_rto: number | null;
  locked: number;
  entered_by: string | null;
  updated_by: string | null;
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
  measured_date: string | null;
  measured_time: string | null;
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
  moisture_note: string | null;
  worker: string | null;
  entered_by: string | null;
  updated_by: string | null;
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
  entered_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyUtility {
  month: string; // YYYY-MM
  elec1_kwh: number | null;
  elec1_won: number | null;
  elec2_kwh: number | null;
  elec2_won: number | null;
  lng_m3: number | null;
  lng_won: number | null;
  diesel_liter: number | null;
  diesel_won: number | null;
  production_ton: number | null;
  note: string | null;
  entered_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// 월별 유틸리티 통합 시트의 한 달치 계산 결과
export interface UtilityMonthRow {
  month: string; // YYYY-MM
  // 전력
  elec1Kwh: number | null;
  elec1Won: number | null;
  elec2Kwh: number | null;
  elec2Won: number | null;
  elecTotalKwh: number | null; // 1공장 + 2공장 사용량 합계
  elecTotalWon: number | null;
  elecUnitPrice: number | null; // 원/kWh
  // LNG
  lngM3: number | null;
  lngWon: number | null;
  lngUnitPrice: number | null;
  // 경유
  dieselLiter: number | null;
  dieselWon: number | null;
  dieselUnitPrice: number | null;
  // 생산량 (일별 합산 또는 월별 보정값)
  productionTon: number | null;
  productionByProduct: Record<string, number>; // 비종별 생산량
  // 톤당
  elecPerTon: number | null;
  lngPerTon: number | null;
  dieselPerTon: number | null;
  utilityWonTotal: number | null; // 전력+LNG+경유 금액 합계
  utilityWonPerTon: number | null;
  // 비종별 전력·가스 사용량 배분 (그날 생산한 비종에 귀속)
  elecByProduct: Record<string, number>;
  lngByProduct: Record<string, number>;
}

// ---------- 제품포장(재고관리) ----------

export type PackingKind = "product" | "bagmat" | "aux";

export interface PackingItem {
  key: string;
  kind: PackingKind;
  category: string | null;
  sub: string | null;
  unit: string | null;
  bag_kg: number | null;
  bag_mat_key: string | null;
  stock: number;
  cumulative_produced: number;
}

export type PackingEntryType = "pack" | "ship";

export interface PackingEntry {
  id: string;
  date: string;
  type: PackingEntryType;
  product_key: string;
  qty: number;
  unit: string | null;
  topsheet_key: string | null;
  topsheet_qty: number | null;
  wrap_key: string | null;
  wrap_qty: number | null;
  bag_mat_key: string | null;
  bag_mat_qty: number | null;
  aux_use_key: string | null;
  aux_use_qty: number | null;
  worker: string | null;
  entered_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackingRestock {
  id: string;
  date: string;
  kind: string | null;
  key: string;
  qty: number;
  worker: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface PackingBreakage {
  id: string;
  date: string;
  kind: string | null;
  key: string;
  qty: number;
  worker: string | null;
  entered_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackingReturn {
  id: string;
  date: string;
  kind: string | null;
  key: string;
  qty: number;
  worker: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface PackingAdjustment {
  id: string;
  date: string;
  kind: string | null;
  key: string;
  qty: number; // 부호 있는 증감값
  reason: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface Worker {
  id: number;
  name: string;
  active: number;
  created_at: string;
}
