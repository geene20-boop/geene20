import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAttendanceActorName, isAttendanceAdminRequest, isModifierRequest, getSessionWorkerId } from "@/lib/auth";
import { logAudit, requireActor } from "@/lib/audit";
import { LeaveRequest } from "@/lib/types";

// 승인은 수정 권한 이상(수정 등급 + 관리자)이 할 수 있지만, 반려는 관리자만 할 수 있다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = isAttendanceAdminRequest(req);
  const modifier = isModifierRequest(req);
  if (!admin && !modifier) {
    return NextResponse.json({ error: "수정 권한 이상만 처리할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM leave_request WHERE id = ?").get(id) as LeaveRequest | undefined;
  if (!row) return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json();
  const status = body.status;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status는 approved 또는 rejected여야 합니다." }, { status: 400 });
  }

  // 반려는 대기중 신청과 이미 승인된 신청 모두 처리 가능
  if (status === "rejected" && !admin) {
    return NextResponse.json({ error: "반려는 관리자만 할 수 있습니다." }, { status: 403 });
  }

  // 승인은 대기중 신청만 가능
  if (status === "approved" && row.status !== "pending") {
    return NextResponse.json({ error: "이미 처리된 신청은 승인할 수 없습니다." }, { status: 409 });
  }

  const decidedBy = admin ? getAttendanceActorName(req) ?? "관리자" : requireActor(req, {}) ?? "관리자";
  db.prepare(
    "UPDATE leave_request SET status = ?, decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(status, decidedBy, id);

  // 반려할 때 이미 승인된 신청이면 연차 차감 취소
  if (status === "rejected" && row.status === "approved" && row.days > 0) {
    const NO_DEDUCTION_TYPES = ["외출", "조퇴", "무급휴무", "유급휴무"];
    if (!NO_DEDUCTION_TYPES.includes(row.type)) {
      db.prepare(
        "UPDATE leave_balance SET used_days = used_days - ?, updated_at = datetime('now') WHERE worker_id = ? AND year = ?"
      ).run(row.days, row.worker_id, new Date(row.start_date).getFullYear());
    }
  }

  logAudit(
    "leave_request",
    `${row.worker_name} ${row.type} ${row.start_date}`,
    "update",
    decidedBy,
    status === "approved" ? "승인" : "반려"
  );

  const updated = db.prepare("SELECT * FROM leave_request WHERE id = ?").get(id);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM leave_request WHERE id = ?").get(id) as LeaveRequest | undefined;
  if (!row) return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });

  const admin = isAttendanceAdminRequest(req);
  if (!admin) {
    const workerId = getSessionWorkerId(req);
    if (workerId == null || workerId !== row.worker_id) {
      return NextResponse.json({ error: "본인 신청만 취소할 수 있습니다." }, { status: 403 });
    }
    if (row.status !== "pending") {
      return NextResponse.json({ error: "대기중인 신청만 취소할 수 있습니다." }, { status: 409 });
    }
  }

  db.prepare("DELETE FROM leave_request WHERE id = ?").run(id);
  logAudit(
    "leave_request",
    `${row.worker_name} ${row.type} ${row.start_date}`,
    "delete",
    admin ? getAttendanceActorName(req) ?? "관리자" : row.worker_name
  );
  return NextResponse.json({ ok: true });
}
