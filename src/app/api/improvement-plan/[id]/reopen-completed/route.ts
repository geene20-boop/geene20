import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isImprovementPlanAdminRequest, getImprovementPlanActorName } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addHistory, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

// 이미 완료 승인된 계획에 추가 보수가 필요할 때, 승인 권한자가 이유를 적어 재검토로 되돌린다.
// 1차 완료일·승인자는 진행 기록에 남기고, 다시 승인되면 새 완료일로 바뀐다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isImprovementPlanAdminRequest(req)) {
    return NextResponse.json({ error: "완료된 계획은 승인 권한자만 재검토로 보낼 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "completed") {
    return NextResponse.json({ error: "완료된 계획만 처리할 수 있습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ error: "추가 보수가 필요한 이유를 입력해주세요." }, { status: 400 });
  const admin = getImprovementPlanActorName(req) ?? "관리자";

  const prev = `이전 완료일 ${row.completed_at?.slice(0, 10) ?? "-"}, 승인 ${row.approved_by ?? "-"}`;
  db.transaction(() => {
    db.prepare(
      `UPDATE improvement_plan
       SET status = 'review', review_reason = ?, reviewed_by = ?, rework_count = rework_count + 1,
           reopened_from_completed = 1, completed_at = NULL, approved_by = NULL,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(reason, admin, id);
    addHistory(db, id, admin, `완료 후 재검토로 보냄 — ${reason} (${prev})`);
  })();

  logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", admin, "완료 후 재검토");

  return NextResponse.json(loadPlanView(db, id));
}
