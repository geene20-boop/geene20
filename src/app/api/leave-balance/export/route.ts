import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWorkerId, isAdminRequest } from "@/lib/auth";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

const DEDUCTING_TYPES = ["연차", "반차(오전)", "반차(오후)"];
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

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

export async function GET(req: NextRequest) {
  const db = getDb();
  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  const admin = isAdminRequest(req);
  const paramWorkerId = req.nextUrl.searchParams.get("workerId");

  let workers: { id: number; name: string; hire_date: string | null }[];
  if (admin) {
    workers = paramWorkerId
      ? (db
          .prepare("SELECT id, name, hire_date FROM worker WHERE id = ?")
          .all(Number(paramWorkerId)) as typeof workers)
      : (db.prepare("SELECT id, name, hire_date FROM worker WHERE active = 1 ORDER BY name").all() as typeof workers);
  } else {
    const workerId = getSessionWorkerId(req);
    if (workerId == null) return NextResponse.json({ error: "근로자 정보를 찾을 수 없습니다." }, { status: 403 });
    workers = db
      .prepare("SELECT id, name, hire_date FROM worker WHERE id = ?")
      .all(workerId) as typeof workers;
  }

  const sheetRows = workers.map((w) => {
    const monthly = computeMonthlyUsedDays(w.id, year);
    const row: Record<string, unknown> = {
      이름: w.name,
      입사일: w.hire_date ?? "",
    };
    MONTH_LABELS.forEach((label, i) => {
      row[label] = monthly[i] || "";
    });
    row["합계"] = monthly.reduce((a, b) => a + b, 0);
    return row;
  });

  const buffer = buildXlsxBuffer(sheetRows, "연차현황상세");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`연차현황상세_${year}.xlsx`),
  });
}
