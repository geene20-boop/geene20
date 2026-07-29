import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, getSessionWorkerId, isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { LeaveRequest } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM leave_request WHERE id = ?").get(id) as LeaveRequest | undefined;
  if (!row) return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: "이미 처리된 신청입니다." }, { status: 409 });
  }

  const body = await req.json();
  const status = body.status;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status는 approved 또는 rejected여야 합니다." }, { status: 400 });
  }

  const decidedBy = getAdminName(req) ?? "관리자";
  db.prepare(
    "UPDATE leave_request SET status = ?, decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(status, decidedBy, id);

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

  const admin = isAdminRequest(req);
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
    admin ? getAdminName(req) ?? "관리자" : row.worker_name
  );
  return NextResponse.json({ ok: true });
}
