import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DailyAttendanceRow, DailyAttendanceStatus, Nationality, ShiftType } from "@/lib/types";

const STATUS_OPTIONS: DailyAttendanceStatus[] = ["early_leave", "comp_off", "late", "absent", "other"];
export const STATUS_LABELS: Record<DailyAttendanceStatus, string> = {
  early_leave: "조퇴",
  comp_off: "대체휴무",
  late: "지각",
  absent: "결근",
  other: "기타",
};

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

  const rows: DailyAttendanceRow[] = workers.map((w) => {
    const daily = dailyByWorker.get(w.id);
    const leave = leaveByWorker.get(w.id);
    const shift = (daily?.shift ?? w.shift_type ?? "day") as ShiftType;

    if (leave) {
      return {
        worker_id: w.id,
        worker_name: w.name,
        nationality: w.nationality,
        date,
        shift,
        statusLabel: `${leave.type} (자동반영)`,
        statusSource: "auto",
        status: null,
        statusDetail: null,
        note: "본인 신청 → 관리자 승인됨",
      };
    }
    if (daily?.status) {
      return {
        worker_id: w.id,
        worker_name: w.name,
        nationality: w.nationality,
        date,
        shift,
        statusLabel: `${STATUS_LABELS[daily.status]}${daily.status_detail ? ` ${daily.status_detail}` : ""}`,
        statusSource: "manual",
        status: daily.status,
        statusDetail: daily.status_detail,
        note: "관리자 직접 입력",
      };
    }
    return {
      worker_id: w.id,
      worker_name: w.name,
      nationality: w.nationality,
      date,
      shift,
      statusLabel: "정상출근",
      statusSource: "default",
      status: null,
      statusDetail: null,
      note: null,
    };
  });

  return NextResponse.json(rows);
}

export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const db = getDb();
  const body = await req.json();
  const workerId = Number(body.workerId);
  const date = String(body.date ?? "");
  if (!Number.isFinite(workerId) || !isValidDate(date)) {
    return NextResponse.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  }

  const worker = db.prepare("SELECT name FROM worker WHERE id = ?").get(workerId) as { name: string } | undefined;
  if (!worker) return NextResponse.json({ error: "근로자를 찾을 수 없습니다." }, { status: 404 });

  const hasStatusField = Object.prototype.hasOwnProperty.call(body, "status");
  if (hasStatusField) {
    const autoLeave = db
      .prepare(
        `SELECT id FROM leave_request WHERE worker_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`
      )
      .get(workerId, date, date);
    if (autoLeave) {
      return NextResponse.json(
        { error: "본인 신청이 승인된 날짜는 근태현황을 직접 수정할 수 없습니다." },
        { status: 400 }
      );
    }
  }

  const existing = db
    .prepare("SELECT shift, status, status_detail FROM daily_attendance WHERE worker_id = ? AND date = ?")
    .get(workerId, date) as
    | { shift: ShiftType | null; status: DailyAttendanceStatus | null; status_detail: string | null }
    | undefined;

  const hasShiftField = Object.prototype.hasOwnProperty.call(body, "shift");
  const shift = hasShiftField
    ? body.shift === "day" || body.shift === "night"
      ? (body.shift as ShiftType)
      : null
    : existing?.shift ?? null;
  const status = hasStatusField
    ? STATUS_OPTIONS.includes(body.status)
      ? (body.status as DailyAttendanceStatus)
      : null
    : existing?.status ?? null;
  const statusDetail = hasStatusField
    ? typeof body.statusDetail === "string" && body.statusDetail.trim()
      ? body.statusDetail.trim().slice(0, 200)
      : null
    : existing?.status_detail ?? null;

  const updatedBy = getAdminName(req) ?? "관리자";
  db.prepare(
    `INSERT INTO daily_attendance (worker_id, date, shift, status, status_detail, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(worker_id, date) DO UPDATE SET
       shift = excluded.shift,
       status = excluded.status,
       status_detail = excluded.status_detail,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  ).run(workerId, date, shift, status, statusDetail, updatedBy);

  logAudit("daily_attendance", `${worker.name} ${date}`, "update", updatedBy);

  const row = db.prepare("SELECT * FROM daily_attendance WHERE worker_id = ? AND date = ?").get(workerId, date);
  return NextResponse.json(row);
}
