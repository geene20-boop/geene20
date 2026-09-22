import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest, getAdminName, isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { deleteAttachmentFile, saveAttachmentFile } from "@/lib/fileStorage";
import { ImprovementPlan } from "@/lib/types";
import { IMPROVEMENT_PLAN_MAX_PHOTO_SIZE, parsePlanForm } from "@/lib/improvementPlan";

// 진행 중인 계획의 등록 내용을 고친다. 관리자 검토가 걸린(승인대기/완료/재검토) 계획은 도중에
// 내용이 바뀌면 안 되므로 진행 중(in_progress) 상태에서만 허용한다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "수정은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress") {
    return NextResponse.json({ error: "진행 중인 계획만 수정할 수 있습니다." }, { status: 409 });
  }

  const form = await req.formData();
  const parsed = parsePlanForm(form);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { category, equipmentName, taskName, startDate, endDate, budget, orgType, vendorName } = parsed;

  const photo = form.get("photo_before");
  let photoPath = row.photo_before_path;
  let photoMime = row.photo_before_mime;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > IMPROVEMENT_PLAN_MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: "사진 용량이 너무 큽니다. (최대 8MB)" }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 첨부할 수 있습니다." }, { status: 400 });
    }
    const buf = Buffer.from(await photo.arrayBuffer());
    photoPath = saveAttachmentFile("improvement-plan", photo.name, buf);
    photoMime = photo.type;
    if (row.photo_before_path) deleteAttachmentFile(row.photo_before_path);
  }

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  db.prepare(
    `UPDATE improvement_plan
     SET category = ?, equipment_name = ?, task_name = ?, start_date = ?, end_date = ?, budget = ?,
         org_type = ?, vendor_name = ?, photo_before_path = ?, photo_before_mime = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    category,
    equipmentName,
    taskName,
    startDate,
    endDate,
    budget,
    orgType,
    vendorName,
    photoPath,
    photoMime,
    id
  );

  logAudit("improvement_plan", `${equipmentName} - ${taskName}`, "update", actor, "내용 수정");

  const updated = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });

  if (row.photo_before_path) deleteAttachmentFile(row.photo_before_path);
  if (row.photo_after_path) deleteAttachmentFile(row.photo_after_path);
  db.prepare("DELETE FROM improvement_plan WHERE id = ?").run(id);

  logAudit(
    "improvement_plan",
    `${row.equipment_name} - ${row.task_name}`,
    "delete",
    getAdminName(req) ?? "관리자"
  );
  return NextResponse.json({ ok: true });
}
