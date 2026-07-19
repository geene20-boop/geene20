// 클라이언트에서도 안전하게 사용 가능한 순수 계산 함수 (DB 접근 없음)
// 이미 불러온 MergedShiftRow[]를 받아 생산일지 작업자 기준으로 그룹화한다.

import { MergedShiftRow } from "@/lib/analytics";

export interface WorkerComparisonRow {
  worker: string; // "미지정" 포함
  shiftCount: number;
  totalPackAmount: number;
  totalGasUsage: number;
  avgGasPerHour: number | null;
  avgHardness: number | null;
  avgMoisture: number | null;
  alertCount: number;
}

function avg(nums: (number | null | undefined)[]): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function getWorkerComparison(rows: MergedShiftRow[]): WorkerComparisonRow[] {
  const byWorker = new Map<string, MergedShiftRow[]>();
  for (const row of rows) {
    const worker = row.production?.worker ?? "미지정";
    if (!byWorker.has(worker)) byWorker.set(worker, []);
    byWorker.get(worker)!.push(row);
  }

  const result: WorkerComparisonRow[] = [];
  for (const [worker, workerRows] of byWorker) {
    result.push({
      worker,
      shiftCount: workerRows.length,
      totalPackAmount: workerRows.reduce((s, r) => s + (r.production?.daily_pack_amount ?? 0), 0),
      totalGasUsage: workerRows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0),
      avgGasPerHour: avg(workerRows.map((r) => r.gasPerHour)),
      avgHardness: avg(workerRows.map((r) => r.hardness)),
      avgMoisture: avg(workerRows.map((r) => r.moisture)),
      alertCount: workerRows.reduce((s, r) => s + r.alerts.length, 0),
    });
  }

  result.sort((a, b) => b.totalPackAmount - a.totalPackAmount);
  return result;
}
