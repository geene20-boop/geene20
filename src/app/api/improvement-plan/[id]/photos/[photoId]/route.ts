import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteAttachmentFile, readAttachmentFile } from "@/lib/fileStorage";
import { canEditPlanPhotos } from "@/lib/improvementPlanAuth";
import { loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

type Params = { params: Promise<{ id: string; photoId: string }> };

function findPhoto(id: string, photoId: string) {
  return getDb()
    .prepare("SELECT id, file_path, mime_type FROM improvement_plan_photo WHERE id = ? AND plan_id = ?")
    .get(photoId, id) as { id: number; file_path: string; mime_type: string | null } | undefined;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, photoId } = await params;
  const photo = findPhoto(id, photoId);
  if (!photo) return NextResponse.json({ error: "사진이 없습니다." }, { status: 404 });
  const data = readAttachmentFile(photo.file_path);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": photo.mime_type || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, photoId } = await params;
  const db = getDb();
  const plan = loadPlan(db, id);
  if (!plan) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (!canEditPlanPhotos(req, plan)) {
    return NextResponse.json(
      { error: "이 단계에서는 사진을 바꿀 수 없습니다. (승인대기·완료 건은 승인 권한자만 가능)" },
      { status: 403 }
    );
  }
  const photo = findPhoto(id, photoId);
  if (!photo) return NextResponse.json({ error: "사진이 없습니다." }, { status: 404 });
  db.prepare("DELETE FROM improvement_plan_photo WHERE id = ?").run(photo.id);
  deleteAttachmentFile(photo.file_path);
  db.prepare("UPDATE improvement_plan SET updated_at = datetime('now') WHERE id = ?").run(id);
  return NextResponse.json(loadPlanView(db, id));
}
