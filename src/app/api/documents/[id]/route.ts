import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DocumentFile } from "@/lib/types";

const METADATA_COLUMNS =
  "id, doc_type, category, item_name, language, ref_date, filename, mime_type, size, entered_by, created_at";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`SELECT ${METADATA_COLUMNS} FROM document_file WHERE id = ?`).get(id) as
    | DocumentFile
    | undefined;
  if (!row) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT doc_type, item_name, filename FROM document_file WHERE id = ?")
    .get(id) as { doc_type: string; item_name: string; filename: string } | undefined;
  if (!row) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });

  db.prepare("DELETE FROM document_file WHERE id = ?").run(id);
  logAudit(
    "document_file",
    `[${row.doc_type}] ${row.item_name}`,
    "delete",
    getAdminName(req) ?? "관리자",
    row.filename
  );
  return NextResponse.json({ ok: true });
}
