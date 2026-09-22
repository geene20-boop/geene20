import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { ImprovementPlan } from "@/lib/types";
import { IMPROVEMENT_PLAN_MAX_PHOTO_SIZE, parsePlanForm } from "@/lib/improvementPlan";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM improvement_plan
       ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'pending_approval' THEN 0 ELSE 1 END,
                priority ASC, updated_at DESC`
    )
    .all() as ImprovementPlan[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "등록은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }

  const form = await req.formData();
  const parsed = parsePlanForm(form);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { category, equipmentName, taskName, startDate, endDate, budget, orgType, vendorName } = parsed;

  const photo = form.get("photo_before");
  let photoPath: string | null = null;
  let photoMime: string | null = null;
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
  }

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  const db = getDb();
  const nextPriority = db
    .prepare(
      "SELECT COALESCE(MAX(priority), 0) + 1 as p FROM improvement_plan WHERE status IN ('in_progress','pending_approval')"
    )
    .get() as { p: number };

  const info = db
    .prepare(
      `INSERT INTO improvement_plan
        (category, equipment_name, task_name, start_date, end_date, budget, org_type, vendor_name,
         photo_before_path, photo_before_mime, priority, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      photoPath,
      photoMime,
      nextPriority.p,
      actor
    );

  logAudit("improvement_plan", `${equipmentName} - ${taskName}`, "create", actor);

  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
