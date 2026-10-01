import Database from "better-sqlite3";
import { ImprovementPlan, ImprovementPlanPhoto, ImprovementPlanView } from "@/lib/types";

// 개선계획 조회·기록 공용 함수 (서버 전용). db를 인자로 받아 테스트에서 메모리 DB로 검증할 수 있게 한다.

const PLAN_ORDER = `ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'pending_approval' THEN 0 ELSE 1 END,
                priority ASC, updated_at DESC`;

function attachExtras(db: Database.Database, rows: ImprovementPlan[]): ImprovementPlanView[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const photos = db
    .prepare(
      `SELECT id, plan_id, which FROM improvement_plan_photo WHERE plan_id IN (${placeholders}) ORDER BY id ASC`
    )
    .all(...ids) as (ImprovementPlanPhoto & { plan_id: number })[];
  const comments = db
    .prepare(
      `SELECT plan_id, COUNT(*) AS cnt, MAX(id) AS last_id FROM improvement_plan_comment
       WHERE kind = 'comment' AND plan_id IN (${placeholders}) GROUP BY plan_id`
    )
    .all(...ids) as { plan_id: number; cnt: number; last_id: number }[];
  const lastIds = comments.map((c) => c.last_id);
  const lastRows = lastIds.length
    ? (db
        .prepare(
          `SELECT id, author, created_at FROM improvement_plan_comment WHERE id IN (${lastIds.map(() => "?").join(",")})`
        )
        .all(...lastIds) as { id: number; author: string; created_at: string }[])
    : [];
  const lastById = new Map(lastRows.map((r) => [r.id, r]));
  const commentByPlan = new Map(comments.map((c) => [c.plan_id, c]));

  return rows.map((r) => {
    const c = commentByPlan.get(r.id);
    const last = c ? lastById.get(c.last_id) : undefined;
    return {
      ...r,
      photos: photos.filter((p) => p.plan_id === r.id).map((p) => ({ id: p.id, which: p.which })),
      comment_count: c?.cnt ?? 0,
      last_comment_at: last?.created_at ?? null,
      last_comment_by: last?.author ?? null,
    };
  });
}

export function loadPlanViews(db: Database.Database): ImprovementPlanView[] {
  const rows = db.prepare(`SELECT * FROM improvement_plan ${PLAN_ORDER}`).all() as ImprovementPlan[];
  return attachExtras(db, rows);
}

export function loadPlanView(db: Database.Database, id: number | string): ImprovementPlanView | null {
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as ImprovementPlan | undefined;
  return row ? attachExtras(db, [row])[0] : null;
}

export function loadPlan(db: Database.Database, id: number | string): ImprovementPlan | undefined {
  return db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as ImprovementPlan | undefined;
}

// 상태 변경 등 진행 기록을 의견란에 자동으로 남긴다.
export function addHistory(db: Database.Database, planId: number | string, author: string, body: string): void {
  db.prepare(
    `INSERT INTO improvement_plan_comment (plan_id, kind, author, role, body) VALUES (?, 'history', ?, NULL, ?)`
  ).run(planId, author, body.slice(0, 1000));
}

export function countPhotos(db: Database.Database, planId: number | string, which: "before" | "after"): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM improvement_plan_photo WHERE plan_id = ? AND which = ?")
      .get(planId, which) as { n: number }
  ).n;
}

export function addPhoto(
  db: Database.Database,
  planId: number | string,
  which: "before" | "after",
  filePath: string,
  mime: string | null,
  createdBy: string
): void {
  db.prepare(
    `INSERT INTO improvement_plan_photo (plan_id, which, file_path, mime_type, created_by) VALUES (?, ?, ?, ?, ?)`
  ).run(planId, which, filePath, mime, createdBy);
}

// 처리할 일 건수: 승인 권한자는 승인대기 건수, 그 외에는 내가 담당인 재검토 건 + 기한 초과 진행 건.
export function countTodo(db: Database.Database, isApprover: boolean, name: string | null, today: string): number {
  if (isApprover) {
    return (
      db.prepare("SELECT COUNT(*) AS n FROM improvement_plan WHERE status = 'pending_approval'").get() as { n: number }
    ).n;
  }
  if (!name) return 0;
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM improvement_plan
         WHERE assignee = ? AND (status = 'review' OR (status = 'in_progress' AND end_date IS NOT NULL AND end_date < ?))`
      )
      .get(name, today) as { n: number }
  ).n;
}
