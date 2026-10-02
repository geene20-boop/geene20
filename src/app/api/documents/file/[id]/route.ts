import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAttachmentFile } from "@/lib/fileStorage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT filename, mime_type, file_path FROM document_file WHERE id = ?")
    .get(id) as { filename: string; mime_type: string | null; file_path: string } | undefined;
  if (!row) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });

  const data = readAttachmentFile(row.file_path);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    },
  });
}
