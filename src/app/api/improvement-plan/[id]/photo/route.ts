import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readAttachmentFile } from "@/lib/fileStorage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const which = req.nextUrl.searchParams.get("which") === "after" ? "after" : "before";
  const db = getDb();
  const row = db
    .prepare(
      `SELECT photo_before_path, photo_before_mime, photo_after_path, photo_after_mime
       FROM improvement_plan WHERE id = ?`
    )
    .get(id) as
    | {
        photo_before_path: string | null;
        photo_before_mime: string | null;
        photo_after_path: string | null;
        photo_after_mime: string | null;
      }
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });

  const filePath = which === "after" ? row.photo_after_path : row.photo_before_path;
  const mime = which === "after" ? row.photo_after_mime : row.photo_before_mime;
  if (!filePath) return NextResponse.json({ error: "사진이 없습니다." }, { status: 404 });

  const data = readAttachmentFile(filePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
