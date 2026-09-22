import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWorkerId, isAttendanceAdminRequest, isModifierRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { LeaveRequest, LeaveType } from "@/lib/types";

const LEAVE_TYPES: LeaveType[] = ["연차", "반차(오전)", "반차(오후)", "외출", "조퇴"];
const HALF_DAY_TYPES: LeaveType[] = ["반차(오전)", "반차(오후)"];
const NO_DEDUCTION_TYPES: LeaveType[] = ["외출", "조퇴"];

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const status = req.nextUrl.searchParams.get("status");
  // 관리자/수정권한 계정이 본인 근태만 조회하고 싶을 때(예: "내 근태" 탭) mine=1로 요청한다.
  const mine = req.nextUrl.searchParams.get("mine") === "1";

  if (!mine && (isAttendanceAdminRequest(req) || isModifierRequest(req))) {
    const rows = status
      ? (db
          .prepare("SELECT * FROM leave_request WHERE status = ? ORDER BY created_at DESC")
          .all(status) as LeaveRequest[])
      : (db.prepare("SELECT * FROM leave_request ORDER BY created_at DESC").all() as LeaveRequest[]);
    return NextResponse.json(rows);
  }

  const workerId = getSessionWorkerId(req);
  if (workerId == null) return NextResponse.json([]);
  const rows = db
    .prepare("SELECT * FROM leave_request WHERE worker_id = ? ORDER BY created_at DESC")
    .all(workerId) as LeaveRequest[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const workerId = getSessionWorkerId(req);
  if (workerId == null) {
    return NextResponse.json(
      { error: "개인계정으로 로그인해야 근태를 신청할 수 있습니다. (관리자에게 계정 연동을 요청하세요)" },
      { status: 403 }
    );
  }
  const db = getDb();
  const worker = db.prepare("SELECT name, nationality FROM worker WHERE id = ?").get(workerId) as
    | { name: string; nationality: string }
    | undefined;
  if (!worker) return NextResponse.json({ error: "근로자 정보를 찾을 수 없습니다." }, { status: 404 });
  if (worker.nationality === "foreign") {
    return NextResponse.json(
      { error: "외국인 근로자는 근태를 직접 신청할 수 없습니다. 관리자에게 문의해주세요." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const type = body.type as LeaveType;
  if (!LEAVE_TYPES.includes(type)) {
    return NextResponse.json({ error: "신청 유형이 올바르지 않습니다." }, { status: 400 });
  }
  const startDate = String(body.startDate ?? "");
  const endDateRaw = String(body.endDate ?? startDate);
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "기간을 올바르게 입력해주세요." }, { status: 400 });
  }
  const isHalfDay = HALF_DAY_TYPES.includes(type);
  const isNoDeduction = NO_DEDUCTION_TYPES.includes(type);
  const endDate = isHalfDay || isNoDeduction ? startDate : endDateRaw;
  if (endDate < startDate) {
    return NextResponse.json({ error: "종료일이 시작일보다 빠릅니다." }, { status: 400 });
  }

  const days = isNoDeduction ? 0 : isHalfDay ? 0.5 : daysBetween(startDate, endDate);

  const requestedBy = requireActor(req, body);
  if (!requestedBy) {
    return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });
  }

  const info = db
    .prepare(
      `INSERT INTO leave_request (worker_id, worker_name, type, start_date, end_date, days, reason, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(workerId, worker.name, type, startDate, endDate, days, reason, requestedBy);

  logAudit(
    "leave_request",
    `${worker.name} ${type} ${startDate}${endDate !== startDate ? `~${endDate}` : ""}`,
    "create",
    requestedBy
  );

  const row = db.prepare("SELECT * FROM leave_request WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
