import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { ImprovementPlan, ImprovementPlanCategory, ImprovementPlanOrgType } from "@/lib/types";

const CATEGORIES: ImprovementPlanCategory[] = ["신규", "보수"];
const ORG_TYPES: ImprovementPlanOrgType[] = ["MIP", "외주"];
const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB (업로드 전 브라우저에서 압축하므로 넉넉히 잡은 상한)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const category = String(form.get("category") ?? "");
  const equipmentName = String(form.get("equipment_name") ?? "").trim();
  const taskName = String(form.get("task_name") ?? "").trim();
  const startDate = form.get("start_date") ? String(form.get("start_date")) : null;
  const endDate = form.get("end_date") ? String(form.get("end_date")) : null;
  const orgType = String(form.get("org_type") ?? "");
  const vendorNameRaw = form.get("vendor_name") ? String(form.get("vendor_name")).trim() : "";
  const budgetRaw = form.get("budget");
  const photo = form.get("photo_before");

  if (!CATEGORIES.includes(category as ImprovementPlanCategory)) {
    return NextResponse.json({ error: "구분(신규/보수)이 올바르지 않습니다." }, { status: 400 });
  }
  if (!equipmentName) {
    return NextResponse.json({ error: "설비명을 입력해주세요." }, { status: 400 });
  }
  if (!taskName) {
    return NextResponse.json({ error: "작업명을 입력해주세요." }, { status: 400 });
  }
  if (startDate && !DATE_RE.test(startDate)) {
    return NextResponse.json({ error: "예상 시작일이 올바르지 않습니다." }, { status: 400 });
  }
  if (endDate && !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: "예상 종료일이 올바르지 않습니다." }, { status: 400 });
  }
  if (startDate && endDate && endDate < startDate) {
    return NextResponse.json({ error: "종료일이 시작일보다 빠릅니다." }, { status: 400 });
  }
  if (!ORG_TYPES.includes(orgType as ImprovementPlanOrgType)) {
    return NextResponse.json({ error: "시행처(MIP/외주)가 올바르지 않습니다." }, { status: 400 });
  }
  const vendorName = orgType === "외주" && vendorNameRaw ? vendorNameRaw.slice(0, 100) : null;
  const budget = Number(budgetRaw ?? 0);
  if (!Number.isFinite(budget) || budget < 0) {
    return NextResponse.json({ error: "예산이 올바르지 않습니다." }, { status: 400 });
  }

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
