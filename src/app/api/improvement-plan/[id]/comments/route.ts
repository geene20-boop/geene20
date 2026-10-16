import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isImprovementPlanAdminRequest } from "@/lib/auth";
import { canCommentPlan, planActorName } from "@/lib/improvementPlanAuth";
import { loadPlan } from "@/lib/improvementPlanStore";
import { ImprovementPlanComment } from "@/lib/types";

// 의견(담당자·관리자 대화)과 진행 기록을 시간순으로 돌려준다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = getDb()
    .prepare("SELECT * FROM improvement_plan_comment WHERE plan_id = ? ORDER BY id ASC")
    .all(id) as ImprovementPlanComment[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!canCommentPlan(req)) {
    return NextResponse.json({ error: "의견 작성은 입력 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const plan = loadPlan(db, id);
  if (!plan) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
  if (!text) return NextResponse.json({ error: "의견 내용을 입력해주세요." }, { status: 400 });
  const actor = planActorName(req, body);
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  // 승인 권한자는 '관리자', 계획의 담당자는 '담당자'로 표시한다.
  const role = isImprovementPlanAdminRequest(req)
    ? "관리자"
    : actor === (plan.assignee ?? plan.created_by)
      ? "담당자"
      : null;

  const info = db
    .prepare(
      `INSERT INTO improvement_plan_comment (plan_id, kind, author, role, body) VALUES (?, 'comment', ?, ?, ?)`
    )
    .run(id, actor, role, text);
  const row = db.prepare("SELECT * FROM improvement_plan_comment WHERE id = ?").get(info.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}
