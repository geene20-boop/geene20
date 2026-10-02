import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { LabJournal, LabJournalFormType } from "@/lib/types";

const FORM_TYPES: LabJournalFormType[] = ["항목형", "자유기술형", "외부시험연동형"];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const conditions: string[] = [];
  const args: unknown[] = [];

  const formType = params.get("form_type");
  if (formType) {
    conditions.push("form_type = ?");
    args.push(formType);
  }
  const itemName = params.get("item_name");
  if (itemName) {
    conditions.push("item_name LIKE ?");
    args.push(`%${itemName}%`);
  }
  const from = params.get("from");
  if (from) {
    conditions.push("date >= ?");
    args.push(from);
  }
  const to = params.get("to");
  if (to) {
    conditions.push("date <= ?");
    args.push(to);
  }

  const db = getDb();
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM lab_journal ${where} ORDER BY date DESC, id DESC`)
    .all(...args) as LabJournal[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "작성은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const body = await req.json();
  const formType = body.form_type as LabJournalFormType;
  const date = typeof body.date === "string" ? body.date : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!FORM_TYPES.includes(formType)) {
    return NextResponse.json({ error: "양식(form_type)이 올바르지 않습니다." }, { status: 400 });
  }
  if (!date) return NextResponse.json({ error: "일자를 입력해주세요." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });

  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  const contentJson = JSON.stringify(body.content ?? {});
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO lab_journal (form_type, date, researcher, item_name, title, content_json, linked_report_id, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      formType,
      date,
      body.researcher ?? null,
      body.item_name ?? null,
      title,
      contentJson,
      body.linked_report_id ?? null,
      actor
    );

  logAudit("lab_journal", title, "create", actor, `[${formType}] ${date}`);

  const row = db.prepare("SELECT * FROM lab_journal WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
