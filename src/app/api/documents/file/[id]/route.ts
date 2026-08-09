import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT filename, mime_type, data FROM document_file WHERE id = ?")
    .get(id) as { filename: string; mime_type: string | null; data: Buffer } | undefined;
  if (!row) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    },
  });
}
