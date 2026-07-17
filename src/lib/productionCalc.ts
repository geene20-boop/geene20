import { getDb } from "@/lib/db";
import { ProductionLog } from "@/lib/types";

// 해당 날짜/조 바로 이전 교대 기록을 찾는다 (전일재고량 기본값 계산용)
export function getPreviousProductionLog(
  date: string,
  shift: string,
  excludeId?: number
): ProductionLog | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM production_log
       WHERE id != ?
         AND (date < ? OR (date = ? AND
              (CASE shift WHEN '주' THEN 0 ELSE 1 END) < (CASE ? WHEN '주' THEN 0 ELSE 1 END)))
       ORDER BY date DESC, (CASE shift WHEN '주' THEN 0 ELSE 1 END) DESC
       LIMIT 1`
    )
    .all(excludeId ?? -1, date, date, shift) as ProductionLog[];
  return rows[0] ?? null;
}

export function computeFeedTotal(mixer: number | null, molder: number | null): number | null {
  if (mixer == null && molder == null) return null;
  return (mixer ?? 0) + (molder ?? 0);
}

export function computeLineHoursTotal(
  lineA: number | null,
  lineB: number | null,
  downtime: number | null
): number | null {
  if (lineA == null && lineB == null) return null;
  const raw = (lineA ?? 0) + (lineB ?? 0);
  return Math.max(0, raw - (downtime ?? 0));
}

export interface LngComputeInput {
  lngDryer: number | null;
  lngRto: number | null;
  carryoverDryer: number | null;
  carryoverRto: number | null;
  fallbackGasUsageShift: number | null; // 과거(엑셀 임포트 등) 수기입력 값 - 누계 정보 없을 때 사용
}

export function computeGasUsage(input: LngComputeInput): number | null {
  const { lngDryer, lngRto, carryoverDryer, carryoverRto, fallbackGasUsageShift } = input;
  const dryerReal = lngDryer != null && carryoverDryer != null ? lngDryer - carryoverDryer : null;
  const rtoReal = lngRto != null && carryoverRto != null ? lngRto - carryoverRto : null;

  if (dryerReal == null && rtoReal == null) return fallbackGasUsageShift;
  return (dryerReal ?? 0) + (rtoReal ?? 0);
}
