import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, isAdminRequest, isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { LabJournal } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM lab_journal WHERE id = ?").get(id) as LabJournal | undefined;
  if (!row) return NextResponse.json({ error: "실험일지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "수정은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare("SELECT id FROM lab_journal WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "실험일지를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  if (!title) return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
  if (!date) return NextResponse.json({ error: "일자를 입력해주세요." }, { status: 400 });

  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  db.prepare(
    `UPDATE lab_journal SET date = ?, researcher = ?, item_name = ?, title = ?, content_json = ?,
     linked_report_id = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    date,
    body.researcher ?? null,
    body.item_name ?? null,
    title,
    JSON.stringify(body.content ?? {}),
    body.linked_report_id ?? null,
    actor,
    id
  );

  logAudit("lab_journal", title, "update", actor);
  const row = db.prepare("SELECT * FROM lab_journal WHERE id = ?").get(id);
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT title FROM lab_journal WHERE id = ?").get(id) as
    | { title: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "실험일지를 찾을 수 없습니다." }, { status: 404 });

  db.prepare("DELETE FROM lab_journal WHERE id = ?").run(id);
  logAudit("lab_journal", row.title, "delete", getAdminName(req) ?? "관리자");
  return NextResponse.json({ ok: true });
}
