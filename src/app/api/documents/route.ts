import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { DocumentCategory, DocumentFile, DocumentLanguage, DocumentType } from "@/lib/types";

const DOC_TYPES: DocumentType[] = ["test_report", "msds"];
const CATEGORIES: DocumentCategory[] = ["원료", "제품"];
const LANGUAGES: DocumentLanguage[] = ["국문", "영문", "기타"];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB, 게시판 첨부와 동일한 제한

const LIST_COLUMNS =
  "id, doc_type, category, item_name, language, ref_date, filename, mime_type, size, entered_by, created_at";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const docType = params.get("doc_type");
  if (!docType || !DOC_TYPES.includes(docType as DocumentType)) {
    return NextResponse.json({ error: "doc_type이 올바르지 않습니다." }, { status: 400 });
  }

  const conditions = ["doc_type = ?"];
  const args: unknown[] = [docType];

  const category = params.get("category");
  if (category) {
    conditions.push("category = ?");
    args.push(category);
  }
  const itemName = params.get("item_name");
  if (itemName) {
    conditions.push("item_name LIKE ?");
    args.push(`%${itemName}%`);
  }
  const language = params.get("language");
  if (language) {
    conditions.push("language = ?");
    args.push(language);
  }
  const from = params.get("from");
  if (from) {
    conditions.push("ref_date >= ?");
    args.push(from);
  }
  const to = params.get("to");
  if (to) {
    conditions.push("ref_date <= ?");
    args.push(to);
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM document_file WHERE ${conditions.join(" AND ")} ORDER BY ref_date DESC, created_at DESC`
    )
    .all(...args) as DocumentFile[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "업로드는 수정 권한 이상만 가능합니다." }, { status: 403 });
  }

  const form = await req.formData();
  const docType = String(form.get("doc_type") ?? "");
  const category = String(form.get("category") ?? "");
  const itemName = String(form.get("item_name") ?? "").trim();
  const language = form.get("language") ? String(form.get("language")) : null;
  const refDate = form.get("ref_date") ? String(form.get("ref_date")) : null;
  const file = form.get("file");

  if (!DOC_TYPES.includes(docType as DocumentType)) {
    return NextResponse.json({ error: "doc_type이 올바르지 않습니다." }, { status: 400 });
  }
  if (!CATEGORIES.includes(category as DocumentCategory)) {
    return NextResponse.json({ error: "구분(원료/제품)이 올바르지 않습니다." }, { status: 400 });
  }
  if (!itemName) {
    return NextResponse.json({ error: "품목명을 입력해주세요." }, { status: 400 });
  }
  if (language && !LANGUAGES.includes(language as DocumentLanguage)) {
    return NextResponse.json({ error: "언어 값이 올바르지 않습니다." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "파일을 첨부해주세요." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "파일이 15MB를 초과합니다." }, { status: 400 });
  }

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const filePath = saveAttachmentFile("documents", file.name, buf);
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO document_file (doc_type, category, item_name, language, ref_date, filename, mime_type, size, file_path, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(docType, category, itemName, language, refDate, file.name, file.type || null, file.size, filePath, actor);

  logAudit("document_file", `[${docType}] ${itemName}`, "create", actor, file.name);

  const row = db
    .prepare(`SELECT ${LIST_COLUMNS} FROM document_file WHERE id = ?`)
    .get(info.lastInsertRowid) as DocumentFile;
  return NextResponse.json(row, { status: 201 });
}
