import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { ImprovementPlan } from "@/lib/types";

// 진행 중인 계획을 재검토로 지정한다 (완료 승인 절차와 별개로, 현장 확인 결과 보류가 필요할 때).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "재검토 지정은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress") {
    return NextResponse.json({ error: "진행 중인 계획만 재검토로 지정할 수 있습니다." }, { status: 409 });
  }

  const body = await req.json();
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : "현장 확인 결과 재검토 필요";
  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "처리자를 확인할 수 없습니다." }, { status: 400 });

  db.prepare(
    `UPDATE improvement_plan SET status = 'review', review_reason = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(reason, actor, id);

  logAudit("improvement_plan", `${row.equipment_name} - ${row.task_name}`, "update", actor, "재검토 지정");

  const updated = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id);
  return NextResponse.json(updated);
}
