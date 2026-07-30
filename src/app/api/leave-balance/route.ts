import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, getSessionWorkerId, isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { LeaveBalance } from "@/lib/types";

const DEDUCTING_TYPES = ["연차", "반차(오전)", "반차(오후)"];

function computeUsedDays(workerId: number, year: number): number {
  const db = getDb();
  const placeholders = DEDUCTING_TYPES.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(days), 0) as used FROM leave_request
       WHERE worker_id = ? AND status = 'approved' AND type IN (${placeholders})
       AND substr(start_date, 1, 4) = ?`
    )
    .get(workerId, ...DEDUCTING_TYPES, String(year)) as { used: number };
  return row.used;
}

function computeMonthlyUsedDays(workerId: number, year: number): number[] {
  const db = getDb();
  const placeholders = DEDUCTING_TYPES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT substr(start_date, 6, 2) as month, COALESCE(SUM(days), 0) as used FROM leave_request
       WHERE worker_id = ? AND status = 'approved' AND type IN (${placeholders})
       AND substr(start_date, 1, 4) = ?
       GROUP BY month`
    )
    .all(workerId, ...DEDUCTING_TYPES, String(year)) as { month: string; used: number }[];
  const monthly = new Array(12).fill(0);
  for (const r of rows) {
    const idx = Number(r.month) - 1;
    if (idx >= 0 && idx < 12) monthly[idx] = r.used;
  }
  return monthly;
}

function toBalance(
  workerId: number,
  workerName: string,
  workerHireDate: string | null,
  year: number,
  row: { accrued_days: number; carried_over_days: number; updated_by: string | null; updated_at: string } | undefined
): LeaveBalance {
  const accrued = row?.accrued_days ?? 0;
  const carried = row?.carried_over_days ?? 0;
  const used = computeUsedDays(workerId, year);
  return {
    worker_id: workerId,
    worker_name: workerName,
    year,
    hire_date: workerHireDate,
    accrued_days: accrued,
    carried_over_days: carried,
    used_days: used,
    remaining_days: accrued + carried - used,
    monthly_used_days: computeMonthlyUsedDays(workerId, year),
    updated_by: row?.updated_by ?? null,
    updated_at: row?.updated_at ?? "",
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  // 관리자 계정이 본인 연차현황만 조회하고 싶을 때(예: "내 근태" 탭) mine=1로 요청한다.
  const mine = req.nextUrl.searchParams.get("mine") === "1";

  if (!mine && isAdminRequest(req)) {
    const workers = db
      .prepare("SELECT id, name, hire_date FROM worker WHERE active = 1 ORDER BY name")
      .all() as { id: number; name: string; hire_date: string | null }[];
    const balances = db
      .prepare("SELECT * FROM leave_balance WHERE year = ?")
      .all(year) as (LeaveBalance & { worker_id: number })[];
    const byWorker = new Map(balances.map((b) => [b.worker_id, b]));
    const result = workers.map((w) => toBalance(w.id, w.name, w.hire_date, year, byWorker.get(w.id)));
    return NextResponse.json(result);
  }

  const workerId = getSessionWorkerId(req);
  if (workerId == null) return NextResponse.json([]);
  const worker = db.prepare("SELECT name, hire_date FROM worker WHERE id = ?").get(workerId) as
    | { name: string; hire_date: string | null }
    | undefined;
  if (!worker) return NextResponse.json([]);
  const balanceRow = db
    .prepare("SELECT * FROM leave_balance WHERE worker_id = ? AND year = ?")
    .get(workerId, year) as (LeaveBalance & { worker_id: number }) | undefined;
  return NextResponse.json([toBalance(workerId, worker.name, worker.hire_date, year, balanceRow)]);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const db = getDb();
  const body = await req.json();
  const workerId = Number(body.workerId);
  const year = Number(body.year);
  const accruedDays = Number(body.accruedDays ?? 0);
  const carriedOverDays = Number(body.carriedOverDays ?? 0);

  const worker = db.prepare("SELECT name, hire_date FROM worker WHERE id = ?").get(workerId) as
    | { name: string; hire_date: string | null }
    | undefined;
  if (!worker) return NextResponse.json({ error: "근로자를 찾을 수 없습니다." }, { status: 404 });
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "연도를 확인해주세요." }, { status: 400 });
  }

  const updatedBy = getAdminName(req) ?? "관리자";
  db.prepare(
    `INSERT INTO leave_balance (worker_id, year, hire_date, accrued_days, carried_over_days, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(worker_id, year) DO UPDATE SET
       accrued_days = excluded.accrued_days,
       carried_over_days = excluded.carried_over_days,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  ).run(workerId, year, worker.hire_date, accruedDays, carriedOverDays, updatedBy);

  logAudit(
    "leave_balance",
    `${worker.name} ${year}년`,
    "update",
    updatedBy,
    `발생 ${accruedDays} / 이월 ${carriedOverDays}`
  );

  const row = db.prepare("SELECT * FROM leave_balance WHERE worker_id = ? AND year = ?").get(workerId, year) as
    | (LeaveBalance & { worker_id: number })
    | undefined;
  return NextResponse.json(toBalance(workerId, worker.name, worker.hire_date, year, row));
}
