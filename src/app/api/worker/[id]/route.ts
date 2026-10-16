import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { Nationality, Worker } from "@/lib/types";
import { logAudit } from "@/lib/audit";

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
  const birthDate = body.birthDate !== undefined ? (body.birthDate || null) : existing.birth_date;
  const nationality =
    body.nationality !== undefined && NATIONALITIES.includes(body.nationality)
      ? body.nationality
      : existing.nationality;
  const foreignCountry = body.foreignCountry !== undefined ? (body.foreignCountry || null) : existing.foreign_country;

  db.prepare(
    "UPDATE worker SET hire_date = ?, birth_date = ?, nationality = ?, foreign_country = ? WHERE id = ?"
  ).run(hireDate, birthDate, nationality, foreignCountry, id);

  logAudit(
    "worker",
    existing.name,
    "update",
    "관리자",
    `입사일 ${hireDate ?? "-"} / 생년월일 ${birthDate ?? "-"} / 국적 ${nationality} / 외국인지역 ${foreignCountry ?? "-"}`
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
