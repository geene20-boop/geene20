import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest, getAdminName, isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { deleteAttachmentFile } from "@/lib/fileStorage";
import { parsePlanForm } from "@/lib/improvementPlan";
import { addHistory, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

// 진행 중인 계획의 등록 내용을 고친다. 관리자 검토가 걸린(승인대기/완료/재검토) 계획은 도중에
// 내용이 바뀌면 안 되므로 진행 중(in_progress) 상태에서만 허용한다.
// 사진은 상세 화면의 사진+ 버튼(photos 라우트)으로 따로 추가·삭제한다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "수정은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress") {
    return NextResponse.json({ error: "진행 중인 계획만 수정할 수 있습니다." }, { status: 409 });
  }

  const form = await req.formData();
  const parsed = parsePlanForm(form);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { category, equipmentName, taskName, startDate, endDate, budget, orgType, vendorName } = parsed;

  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });
  const assignee = parsed.assignee ?? row.assignee ?? row.created_by;

  // 진행 기록에 무엇이 바뀌었는지 남긴다
  const changes: string[] = [];
  if ((row.start_date ?? "") !== (startDate ?? "") || (row.end_date ?? "") !== (endDate ?? "")) {
    changes.push(`일정 ${row.start_date ?? "-"}~${row.end_date ?? "-"} → ${startDate ?? "-"}~${endDate ?? "-"}`);
  }
  if (row.budget !== budget) changes.push(`예산 ${won(row.budget)} → ${won(budget)}`);
  if ((row.assignee ?? "") !== assignee) changes.push(`담당자 ${row.assignee ?? "-"} → ${assignee}`);
  if (row.equipment_name !== equipmentName || row.task_name !== taskName) changes.push("설비명/작업명");
  if (row.category !== category) changes.push(`구분 ${row.category} → ${category}`);
  if (row.org_type !== orgType || (row.vendor_name ?? "") !== (vendorName ?? "")) changes.push("시행처");

  db.transaction(() => {
    db.prepare(
      `UPDATE improvement_plan
       SET category = ?, equipment_name = ?, task_name = ?, start_date = ?, end_date = ?, budget = ?,
           org_type = ?, vendor_name = ?, assignee = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(category, equipmentName, taskName, startDate, endDate, budget, orgType, vendorName, assignee, id);
    if (changes.length > 0) addHistory(db, id, actor, `내용 수정 — ${changes.join(", ")}`);
  })();

  logAudit("improvement_plan", `${equipmentName} - ${taskName}`, "update", actor, "내용 수정");

  return NextResponse.json(loadPlanView(db, id));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });

  const photos = db.prepare("SELECT file_path FROM improvement_plan_photo WHERE plan_id = ?").all(id) as {
    file_path: string;
  }[];
  for (const p of photos) deleteAttachmentFile(p.file_path);
  if (row.photo_before_path) deleteAttachmentFile(row.photo_before_path);
  if (row.photo_after_path) deleteAttachmentFile(row.photo_after_path);
  db.transaction(() => {
    db.prepare("DELETE FROM improvement_plan_photo WHERE plan_id = ?").run(id);
    db.prepare("DELETE FROM improvement_plan_comment WHERE plan_id = ?").run(id);
    db.prepare("DELETE FROM improvement_plan WHERE id = ?").run(id);
  })();

  logAudit(
    "improvement_plan",
    `${row.equipment_name} - ${row.task_name}`,
    "delete",
    getAdminName(req) ?? "관리자"
  );
  return NextResponse.json({ ok: true });
}
