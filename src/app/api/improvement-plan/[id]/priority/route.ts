import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { ImprovementPlan } from "@/lib/types";
import { moveToPosition } from "@/lib/improvementPlan";
import { loadPlanViews } from "@/lib/improvementPlanStore";

// 진행중 목록에서 순위를 바꾼다.
// - { position: n }: n위로 바로 이동 (순위 숫자를 눌러 입력, 맨 위로/맨 아래로)
// - { direction: "up" | "down" }: 한 칸 위/아래 (▲▼ 버튼)
// 옮긴 뒤 진행 목록 전체의 순위를 화면 순서 그대로 1부터 다시 매겨, 순위값이 겹쳐 움직이지 않는 일이 없게 한다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "순서 변경은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as ImprovementPlan | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress" && row.status !== "pending_approval") {
    return NextResponse.json({ error: "진행 중인 계획만 순서를 바꿀 수 있습니다." }, { status: 409 });
  }

  // 화면(목록 조회)과 같은 정렬 기준
  const ordered = (
    db
      .prepare(
        `SELECT id FROM improvement_plan WHERE status IN ('in_progress','pending_approval')
         ORDER BY priority ASC, updated_at DESC`
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
  const current = ordered.indexOf(row.id) + 1;

  let target: number;
  if (body.position !== undefined) {
    const n = Number(body.position);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "순위는 1 이상의 숫자로 입력해주세요." }, { status: 400 });
    }
    target = Math.min(n, ordered.length);
  } else if (body.direction === "up" || body.direction === "down") {
    target = body.direction === "up" ? current - 1 : current + 1;
    if (target < 1 || target > ordered.length) {
      return NextResponse.json({ error: "더 이상 이동할 수 없습니다." }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: "position 또는 direction(up/down)이 필요합니다." }, { status: 400 });
  }

  if (target !== current) {
    const next = moveToPosition(ordered, row.id, target);
    const update = db.prepare("UPDATE improvement_plan SET priority = ? WHERE id = ?");
    db.transaction(() => {
      next.forEach((pid, i) => update.run(i + 1, pid));
      db.prepare("UPDATE improvement_plan SET updated_at = datetime('now') WHERE id = ?").run(row.id);
    })();
  }

  return NextResponse.json(loadPlanViews(db));
}
