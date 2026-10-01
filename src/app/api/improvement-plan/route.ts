import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import {
  IMPROVEMENT_PLAN_MAX_PHOTO_SIZE,
  IMPROVEMENT_PLAN_MAX_PHOTOS,
  parsePlanForm,
} from "@/lib/improvementPlan";
import { addHistory, addPhoto, loadPlanView, loadPlanViews } from "@/lib/improvementPlanStore";

export async function GET() {
  return NextResponse.json(loadPlanViews(getDb()));
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "등록은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }

  const form = await req.formData();
  const parsed = parsePlanForm(form);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { category, equipmentName, taskName, startDate, endDate, budget, orgType, vendorName } = parsed;

  // 개선 전 사진은 등록할 때 최대 3장까지 함께 올릴 수 있다.
  const photos = form.getAll("photo_before").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > IMPROVEMENT_PLAN_MAX_PHOTOS) {
    return NextResponse.json({ error: `사진은 최대 ${IMPROVEMENT_PLAN_MAX_PHOTOS}장까지 올릴 수 있습니다.` }, { status: 400 });
  }
  for (const photo of photos) {
    if (photo.size > IMPROVEMENT_PLAN_MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: "사진 용량이 너무 큽니다. (최대 8MB)" }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 첨부할 수 있습니다." }, { status: 400 });
    }
  }

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const assignee = parsed.assignee ?? actor;

  const saved: { path: string; mime: string }[] = [];
  for (const photo of photos) {
    const buf = Buffer.from(await photo.arrayBuffer());
    saved.push({ path: saveAttachmentFile("improvement-plan", photo.name, buf), mime: photo.type });
  }

  const db = getDb();
  const id = db.transaction(() => {
    const nextPriority = db
      .prepare(
        "SELECT COALESCE(MAX(priority), 0) + 1 as p FROM improvement_plan WHERE status IN ('in_progress','pending_approval')"
      )
      .get() as { p: number };
    const info = db
      .prepare(
        `INSERT INTO improvement_plan
          (category, equipment_name, task_name, start_date, end_date, budget, org_type, vendor_name,
           priority, assignee, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        category,
        equipmentName,
        taskName,
        startDate,
        endDate,
        budget,
        orgType,
        vendorName,
        nextPriority.p,
        assignee,
        actor
      );
    const newId = Number(info.lastInsertRowid);
    for (const s of saved) addPhoto(db, newId, "before", s.path, s.mime, actor);
    addHistory(db, newId, actor, `계획 등록 (담당자: ${assignee})`);
    return newId;
  })();

  logAudit("improvement_plan", `${equipmentName} - ${taskName}`, "create", actor);

  return NextResponse.json(loadPlanView(db, id), { status: 201 });
}
