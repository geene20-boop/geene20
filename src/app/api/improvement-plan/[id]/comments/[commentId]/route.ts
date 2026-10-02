import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canCommentPlan, planActorName } from "@/lib/improvementPlanAuth";
import { ImprovementPlanComment } from "@/lib/types";

// 본인이 쓴 의견만 지울 수 있다. 진행 기록(자동 기록)은 지울 수 없다.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  if (!canCommentPlan(req)) {
    return NextResponse.json({ error: "의견 삭제 권한이 없습니다." }, { status: 403 });
  }
  const { id, commentId } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM improvement_plan_comment WHERE id = ? AND plan_id = ?")
    .get(commentId, id) as ImprovementPlanComment | undefined;
  if (!row) return NextResponse.json({ error: "의견을 찾을 수 없습니다." }, { status: 404 });
  if (row.kind !== "comment") {
    return NextResponse.json({ error: "진행 기록은 지울 수 없습니다." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const actor = planActorName(req, body);
  if (!actor || actor !== row.author) {
    return NextResponse.json({ error: "본인이 쓴 의견만 지울 수 있습니다." }, { status: 403 });
  }
  db.prepare("DELETE FROM improvement_plan_comment WHERE id = ?").run(row.id);
  return NextResponse.json({ ok: true });
}
