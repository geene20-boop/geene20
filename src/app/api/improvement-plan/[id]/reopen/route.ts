import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { addHistory, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

// 재검토 건을 다시 진행 중인 계획으로 되돌린다 (재작업이 길어져 일정·예산을 다시 잡아야 할 때).
// 진행중 목록 맨 아래 순위로 들어간다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "진행중 복귀는 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "review") {
    return NextResponse.json({ error: "재검토 중인 계획만 진행중으로 되돌릴 수 있습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "처리자를 확인할 수 없습니다." }, { status: 400 });

  db.transaction(() => {
    const next = db
      .prepare(
        "SELECT COALESCE(MAX(priority), 0) + 1 as p FROM improvement_plan WHERE status IN ('in_progress','pending_approval')"
      )
      .get() as { p: number };
    db.prepare(
      `UPDATE improvement_plan
       SET status = 'in_progress', priority = ?, review_reason = NULL, reviewed_by = NULL,
           reopened_from_completed = 0, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.p, id);
    addHistory(db, id, actor, "진행중으로 복귀");
  })();

  logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", actor, "진행중 복귀");

  return NextResponse.json(loadPlanView(db, id));
}
