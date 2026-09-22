import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { ImprovementPlan } from "@/lib/types";

const ACTIVE_STATUSES = "('in_progress','pending_approval')";

// 진행중 목록에서 우선순위를 한 칸 위/아래로 옮긴다 (인접한 행과 priority 값을 맞바꿈).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "순서 변경은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const direction = body.direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "direction은 up 또는 down이어야 합니다." }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "in_progress" && row.status !== "pending_approval") {
    return NextResponse.json({ error: "진행 중인 계획만 순서를 바꿀 수 있습니다." }, { status: 409 });
  }

  const ordered = db
    .prepare(
      `SELECT id, priority FROM improvement_plan WHERE status IN ${ACTIVE_STATUSES} ORDER BY priority ASC, id ASC`
    )
    .all() as { id: number; priority: number }[];
  const idx = ordered.findIndex((r) => r.id === row.id);
  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= ordered.length) {
    return NextResponse.json({ error: "더 이상 이동할 수 없습니다." }, { status: 409 });
  }
  const current = ordered[idx];
  const neighbor = ordered[neighborIdx];

  const swap = db.transaction(() => {
    db.prepare("UPDATE improvement_plan SET priority = ?, updated_at = datetime('now') WHERE id = ?").run(
      neighbor.priority,
      current.id
    );
    db.prepare("UPDATE improvement_plan SET priority = ?, updated_at = datetime('now') WHERE id = ?").run(
      current.priority,
      neighbor.id
    );
  });
  swap();

  const rows = db
    .prepare(
      `SELECT * FROM improvement_plan
       ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'pending_approval' THEN 0 ELSE 1 END,
                priority ASC, updated_at DESC`
    )
    .all();
  return NextResponse.json(rows);
}
