import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { parseCost } from "@/lib/improvementPlan";
import { addHistory, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

// 담당자가 진행 중인 계획을(또는 재검토 항목을 재작업한 뒤) "완료 요청"하면 승인대기 상태가 되고,
// 이후 관리자만 최종 승인하거나 재검토로 보낼 수 있다. 완료 요청 때 실제 집행비를 함께 적는다.
// (개선 후 사진은 상세 화면의 사진+ 버튼으로 미리 올린다)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "완료 요청은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress" && row.status !== "review") {
    return NextResponse.json(
      { error: "진행 중이거나 재검토 중인 계획만 완료를 요청할 수 있습니다." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const cost = parseCost(body.actual_cost);
  if (cost !== null && typeof cost === "object") return NextResponse.json({ error: cost.error }, { status: 400 });
  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  const label = row.status === "review" ? "재작업 완료 요청" : "완료 요청";
  db.transaction(() => {
    db.prepare(
      `UPDATE improvement_plan
       SET status = 'pending_approval', actual_cost = COALESCE(?, actual_cost),
           completion_requested_by = ?, completion_requested_at = datetime('now'),
           review_reason = NULL, reviewed_by = NULL,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(cost, actor, id);
    addHistory(
      db,
      id,
      actor,
      cost !== null ? `${label} (실제 집행비 ${cost.toLocaleString("ko-KR")}원)` : label
    );
  })();

  logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", actor, label);

  return NextResponse.json(loadPlanView(db, id));
}
