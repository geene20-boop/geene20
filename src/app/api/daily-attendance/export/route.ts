import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";
import { DailyAttendanceStatus, Nationality, ShiftType } from "@/lib/types";
import { STATUS_LABELS } from "../route";

const SHIFT_LABELS: Record<ShiftType, string> = { day: "주간", night: "야간" };
const NATIONALITY_LABELS: Record<Nationality, string> = { domestic: "내국인", foreign: "외국인" };

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "날짜를 확인해주세요." }, { status: 400 });
  }

  const db = getDb();
  const workers = db
    .prepare("SELECT id, name, nationality, shift_type FROM worker WHERE active = 1 ORDER BY name")
    .all() as { id: number; name: string; nationality: Nationality; shift_type: ShiftType | null }[];

  const dailyRows = db
    .prepare("SELECT worker_id, shift, status, status_detail FROM daily_attendance WHERE date = ?")
    .all(date) as {
    worker_id: number;
    shift: ShiftType | null;
    status: DailyAttendanceStatus | null;
    status_detail: string | null;
  }[];
  const dailyByWorker = new Map(dailyRows.map((r) => [r.worker_id, r]));

  const leaveRows = db
    .prepare(
      `SELECT worker_id, type FROM leave_request
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
    )
    .all(date, date) as { worker_id: number; type: string }[];
  const leaveByWorker = new Map(leaveRows.map((r) => [r.worker_id, r]));

  const sheetRows = workers.map((w) => {
    const daily = dailyByWorker.get(w.id);
    const leave = leaveByWorker.get(w.id);
    const shift = (daily?.shift ?? w.shift_type ?? "day") as ShiftType;
    const status = leave
      ? `${leave.type} (자동반영)`
      : daily?.status
      ? `${STATUS_LABELS[daily.status]}${daily.status_detail ? ` ${daily.status_detail}` : ""}`
      : "정상출근";
    return {
      이름: w.name,
      국적: NATIONALITY_LABELS[w.nationality],
      근무조: SHIFT_LABELS[shift],
      근태현황: status,
    };
  });

  const buffer = buildXlsxBuffer(sheetRows, "일일출근부");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`일일출근부_${date}.xlsx`),
  });
}
