import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAttachmentFile } from "@/lib/fileStorage";

// 첨부(견적서·사진·납품 사진) 보기
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; attId: string }> }) {
  const { id, attId } = await params;
  const row = getDb()
    .prepare("SELECT file_name, file_path, mime_type FROM purchase_attachment WHERE id = ? AND request_id = ?")
    .get(attId, id) as { file_name: string; file_path: string; mime_type: string | null } | undefined;
  if (!row) return NextResponse.json({ error: "첨부 파일이 없습니다." }, { status: 404 });
  const data = readAttachmentFile(row.file_path);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
