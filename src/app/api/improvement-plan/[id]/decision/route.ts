import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest, getAdminName } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ImprovementPlan } from "@/lib/types";

// 완료 요청(승인대기)에 대한 최종 결정 - 관리자만 할 수 있다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "완료 승인/반려는 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "pending_approval") {
    return NextResponse.json({ error: "완료 요청 상태인 계획만 처리할 수 있습니다." }, { status: 409 });
  }

  const body = await req.json();
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision은 approve 또는 reject여야 합니다." }, { status: 400 });
  }
  const admin = getAdminName(req) ?? "관리자";

  if (decision === "approve") {
    db.prepare(
      `UPDATE improvement_plan
       SET status = 'completed', approved_by = ?, completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(admin, id);
    logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", admin, "완료 승인");
  } else {
    const reason = body.reason ? String(body.reason).trim().slice(0, 500) : "완료 요청 반려 - 재확인 필요";
    db.prepare(
      `UPDATE improvement_plan
       SET status = 'review', review_reason = ?, reviewed_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(reason, admin, id);
    logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", admin, "완료 반려");
  }

  const updated = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id);
  return NextResponse.json(updated);
}
