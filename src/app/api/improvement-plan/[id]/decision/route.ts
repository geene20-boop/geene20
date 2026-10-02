import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isImprovementPlanAdminRequest, getImprovementPlanActorName } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addHistory, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

// 완료 요청(승인대기)에 대한 최종 결정 - 관리자 또는 승인 권한을 받은 특정 개인만 할 수 있다.
// 승인하면 완료, 추가 보수가 필요하면 이유를 반드시 적어 재검토로 보낸다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isImprovementPlanAdminRequest(req)) {
    return NextResponse.json({ error: "완료 승인/재검토 결정 권한이 없습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = loadPlan(db, id);
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "pending_approval") {
    return NextResponse.json({ error: "완료 요청 상태인 계획만 처리할 수 있습니다." }, { status: 409 });
  }

  const body = await req.json();
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision은 approve 또는 reject여야 합니다." }, { status: 400 });
  }
  const admin = getImprovementPlanActorName(req) ?? "관리자";

  if (decision === "approve") {
    db.transaction(() => {
      db.prepare(
        `UPDATE improvement_plan
         SET status = 'completed', approved_by = ?, completed_at = datetime('now'),
             reopened_from_completed = 0, updated_at = datetime('now')
         WHERE id = ?`
      ).run(admin, id);
      addHistory(db, id, admin, "완료 승인");
    })();
    logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", admin, "완료 승인");
  } else {
    const reason = body.reason ? String(body.reason).trim().slice(0, 500) : "";
    if (!reason) {
      return NextResponse.json({ error: "재검토로 보내는 이유를 입력해주세요." }, { status: 400 });
    }
    db.transaction(() => {
      db.prepare(
        `UPDATE improvement_plan
         SET status = 'review', review_reason = ?, reviewed_by = ?, rework_count = rework_count + 1,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(reason, admin, id);
      addHistory(db, id, admin, `재검토로 보냄 — ${reason}`);
    })();
    logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", admin, "완료 요청 재검토");
  }

  return NextResponse.json(loadPlanView(db, id));
}
