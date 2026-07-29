import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { Nationality, ShiftType, Worker } from "@/lib/types";
import { logAudit } from "@/lib/audit";

const SHIFT_TYPES: ShiftType[] = ["day", "night"];
const NATIONALITIES: Nationality[] = ["domestic", "foreign"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM worker WHERE id = ?").get(id) as Worker | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 근로자입니다." }, { status: 404 });
  }

  const body = await req.json();
  const hireDate = body.hireDate !== undefined ? (body.hireDate || null) : existing.hire_date;
  const shiftType =
    body.shiftType !== undefined
      ? SHIFT_TYPES.includes(body.shiftType) ? body.shiftType : null
      : existing.shift_type;
  const nationality =
    body.nationality !== undefined && NATIONALITIES.includes(body.nationality)
      ? body.nationality
      : existing.nationality;

  db.prepare(
    "UPDATE worker SET hire_date = ?, shift_type = ?, nationality = ? WHERE id = ?"
  ).run(hireDate, shiftType, nationality, id);

  logAudit(
    "worker",
    existing.name,
    "update",
    "관리자",
    `입사일 ${hireDate ?? "-"} / 근무형태 ${shiftType ?? "-"} / 국적 ${nationality}`
  );

  const updated = db.prepare("SELECT * FROM worker WHERE id = ?").get(id);
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM worker WHERE id = ?").get(id) as Worker | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 근로자입니다." }, { status: 404 });
  }
  db.prepare("UPDATE worker SET active = 0 WHERE id = ?").run(id);
  logAudit("worker", existing.name, "delete", "관리자");
  return NextResponse.json({ ok: true });
}
