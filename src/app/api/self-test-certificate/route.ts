import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { CertificateLanguage, SelfTestCertificate } from "@/lib/types";

const LANGUAGES: CertificateLanguage[] = ["국문", "영문"];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const conditions: string[] = [];
  const args: unknown[] = [];

  const itemName = params.get("item_name");
  if (itemName) {
    conditions.push("item_name LIKE ?");
    args.push(`%${itemName}%`);
  }
  const from = params.get("from");
  if (from) {
    conditions.push("issued_date >= ?");
    args.push(from);
  }
  const to = params.get("to");
  if (to) {
    conditions.push("issued_date <= ?");
    args.push(to);
  }

  const db = getDb();
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM self_test_certificate ${where} ORDER BY issued_date DESC, id DESC`)
    .all(...args) as SelfTestCertificate[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "발행은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const body = await req.json();
  const itemName = typeof body.item_name === "string" ? body.item_name.trim() : "";
  const issuedDate = typeof body.issued_date === "string" ? body.issued_date : "";
  const language = (body.language as CertificateLanguage) ?? "국문";

  if (!itemName) return NextResponse.json({ error: "품목명을 입력해주세요." }, { status: 400 });
  if (!issuedDate) return NextResponse.json({ error: "발행일자를 입력해주세요." }, { status: 400 });
  if (!LANGUAGES.includes(language)) {
    return NextResponse.json({ error: "언어 값이 올바르지 않습니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO self_test_certificate
       (report_no, item_name, specification, remarks, result, language, consignee, issued_date, issued_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.report_no ?? null,
      itemName,
      body.specification ?? null,
      body.remarks ?? null,
      body.result ?? null,
      language,
      body.consignee ?? null,
      issuedDate,
      actor
    );

  logAudit("self_test_certificate", itemName, "create", actor, `발행일 ${issuedDate}`);

  const row = db.prepare("SELECT * FROM self_test_certificate WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
