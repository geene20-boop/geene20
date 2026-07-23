import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { Worker } from "@/lib/types";
import { logAudit } from "@/lib/audit";

// 근로자명부 목록은 생산/출하 입력 등 여러 화면에서 드롭다운으로 쓰이므로 누구나 조회 가능
export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM worker WHERE active = 1 ORDER BY name").all() as Worker[];
  return NextResponse.json(rows);
}

// 명부 추가/삭제는 관리자만
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const db = getDb();
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare("SELECT id, active FROM worker WHERE name = ?").get(name) as
    | { id: number; active: number }
    | undefined;
  if (existing) {
    if (existing.active) {
      return NextResponse.json({ error: "이미 등록된 이름입니다." }, { status: 409 });
    }
    db.prepare("UPDATE worker SET active = 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare("INSERT INTO worker (name) VALUES (?)").run(name);
  }

  logAudit("worker", name, "create", "관리자");
  const row = db.prepare("SELECT * FROM worker WHERE name = ?").get(name);
  return NextResponse.json(row, { status: 201 });
}
