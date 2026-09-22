import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { ImprovementPlan } from "@/lib/types";

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;

// 담당자가 진행 중인 계획을 "완료 요청"하면 승인대기 상태가 되고, 이후 관리자만 최종 승인/반려할 수 있다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "완료 요청은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress") {
    return NextResponse.json({ error: "진행 중인 계획만 완료를 요청할 수 있습니다." }, { status: 409 });
  }

  const form = await req.formData();
  const photo = form.get("photo_after");
  let photoPath: string | null = null;
  let photoMime: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: "사진 용량이 너무 큽니다. (최대 8MB)" }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 첨부할 수 있습니다." }, { status: 400 });
    }
    const buf = Buffer.from(await photo.arrayBuffer());
    photoPath = saveAttachmentFile("improvement-plan", photo.name, buf);
    photoMime = photo.type;
  }

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  db.prepare(
    `UPDATE improvement_plan
     SET status = 'pending_approval', photo_after_path = COALESCE(?, photo_after_path),
         photo_after_mime = COALESCE(?, photo_after_mime),
         completion_requested_by = ?, completion_requested_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(photoPath, photoMime, actor, id);

  logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", actor, "완료 요청");

  const updated = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id);
  return NextResponse.json(updated);
}
