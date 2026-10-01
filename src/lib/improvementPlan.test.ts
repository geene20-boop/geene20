import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { computeDashboard, isOverdue, parseCost, parsePlanForm } from "@/lib/improvementPlan";
import { addHistory, addPhoto, countPhotos, countTodo, loadPlanView, loadPlanViews } from "@/lib/improvementPlanStore";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE improvement_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT '보수',
      equipment_name TEXT NOT NULL,
      task_name TEXT NOT NULL,
      start_date TEXT, end_date TEXT,
      budget REAL NOT NULL DEFAULT 0,
      org_type TEXT NOT NULL DEFAULT 'MIP',
      vendor_name TEXT,
      photo_before_path TEXT, photo_before_mime TEXT, photo_after_path TEXT, photo_after_mime TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      priority INTEGER NOT NULL DEFAULT 0,
      assignee TEXT, actual_cost REAL,
      rework_count INTEGER NOT NULL DEFAULT 0,
      reopened_from_completed INTEGER NOT NULL DEFAULT 0,
      review_reason TEXT, reviewed_by TEXT,
      completion_requested_by TEXT, completion_requested_at TEXT,
      approved_by TEXT, completed_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE improvement_plan_photo (
      id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, which TEXT NOT NULL,
      file_path TEXT NOT NULL, mime_type TEXT, created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE improvement_plan_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'comment', author TEXT NOT NULL, role TEXT, body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function insertPlan(db: Database.Database, fields: Record<string, unknown>): number {
  const row = { equipment_name: "C선별기", task_name: "덕트 보수", created_by: "관리자", ...fields };
  const cols = Object.keys(row);
  const info = db
    .prepare(`INSERT INTO improvement_plan (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...Object.values(row));
  return Number(info.lastInsertRowid);
}

describe("parsePlanForm 담당자", () => {
  function form(extra: Record<string, string>) {
    const fd = new FormData();
    fd.set("category", "보수");
    fd.set("equipment_name", "C선별기");
    fd.set("task_name", "덕트 보수");
    fd.set("org_type", "MIP");
    fd.set("budget", "350000");
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  it("담당자 이름을 앞뒤 공백 없이 읽는다", () => {
    const r = parsePlanForm(form({ assignee: "  김은미 " }));
    expect("error" in r ? null : r.assignee).toBe("김은미");
  });

  it("담당자를 비우면 null (서버에서 작성자로 대체)", () => {
    const r = parsePlanForm(form({}));
    expect("error" in r ? "err" : r.assignee).toBeNull();
  });
});

describe("parseCost 실제 집행비", () => {
  it("빈 값은 입력 안 함(null)", () => {
    expect(parseCost("")).toBeNull();
    expect(parseCost(undefined)).toBeNull();
  });
  it("쉼표가 있어도 숫자로 읽는다", () => {
    expect(parseCost("410,000")).toBe(410000);
    expect(parseCost(0)).toBe(0);
  });
  it("음수·문자는 오류", () => {
    expect(parseCost("-5")).toEqual({ error: expect.any(String) });
    expect(parseCost("abc")).toEqual({ error: expect.any(String) });
  });
});

describe("computeDashboard 현황판", () => {
  const base = { budget: 0, actual_cost: null, reopened_from_completed: 0, equipment_name: "설비" };
  const plans = [
    { ...base, status: "in_progress" as const, end_date: "2026-10-20", created_at: "2026-09-01 00:00:00", budget: 1_000_000 },
    { ...base, status: "in_progress" as const, end_date: "2026-09-30", created_at: "2026-09-01 00:00:00", equipment_name: "랩핑기" },
    { ...base, status: "pending_approval" as const, end_date: null, created_at: "2026-08-01 00:00:00", budget: 500_000, actual_cost: 600_000 },
    { ...base, status: "review" as const, end_date: null, created_at: "2025-12-01 00:00:00", budget: 9_000_000, reopened_from_completed: 1 },
    { ...base, status: "completed" as const, end_date: "2026-01-01", created_at: "2026-01-01 00:00:00", budget: 2_000_000, actual_cost: 1_500_000 },
  ];

  it("상태별 건수와 기한 초과를 센다", () => {
    const d = computeDashboard(plans, "2026-10-01");
    expect(d.inProgress).toBe(2);
    expect(d.dueThisMonth).toBe(1);
    expect(d.pending).toBe(1);
    expect(d.overdue).toBe(1);
    expect(d.overdueNames).toEqual(["랩핑기"]);
    expect(d.review).toBe(1);
    expect(d.reopened).toBe(1);
  });

  it("올해 등록분만 예산·집행비를 합산한다 (작년 등록분 제외)", () => {
    const d = computeDashboard(plans, "2026-10-01");
    expect(d.yearBudget).toBe(3_500_000);
    expect(d.yearSpent).toBe(2_100_000);
  });

  it("완료·재검토 건은 기한 초과로 치지 않는다", () => {
    expect(isOverdue({ status: "completed", end_date: "2026-01-01" }, "2026-10-01")).toBe(false);
    expect(isOverdue({ status: "review", end_date: "2026-01-01" }, "2026-10-01")).toBe(false);
    expect(isOverdue({ status: "pending_approval", end_date: "2026-09-30" }, "2026-10-01")).toBe(true);
  });
});

describe("improvementPlanStore", () => {
  it("목록에 사진 목록·의견 수·마지막 의견 작성자를 붙인다 (진행 기록은 의견 수에서 제외)", () => {
    const db = makeDb();
    const id = insertPlan(db, {});
    const other = insertPlan(db, { equipment_name: "랩핑기" });
    addPhoto(db, id, "before", "a.webp", "image/webp", "관리자");
    addPhoto(db, id, "after", "b.webp", "image/webp", "관리자");
    addHistory(db, id, "관리자", "계획 등록");
    db.prepare("INSERT INTO improvement_plan_comment (plan_id, kind, author, role, body) VALUES (?, 'comment', ?, ?, ?)").run(
      id,
      "김은미",
      "담당자",
      "PLC 업체 방문 예정"
    );
    db.prepare("INSERT INTO improvement_plan_comment (plan_id, kind, author, role, body) VALUES (?, 'comment', ?, ?, ?)").run(
      id,
      "박성준",
      "관리자",
      "견적 받아주세요"
    );

    const view = loadPlanView(db, id)!;
    expect(view.photos.map((p) => p.which)).toEqual(["before", "after"]);
    expect(view.comment_count).toBe(2);
    expect(view.last_comment_by).toBe("박성준");

    const list = loadPlanViews(db);
    expect(list.find((p) => p.id === other)!.comment_count).toBe(0);
    expect(list.find((p) => p.id === other)!.photos).toEqual([]);
    expect(countPhotos(db, id, "before")).toBe(1);
  });

  it("처리할 건수: 승인 권한자는 승인대기, 담당자는 내 재검토·기한 초과", () => {
    const db = makeDb();
    insertPlan(db, { status: "pending_approval", assignee: "김은미" });
    insertPlan(db, { status: "review", assignee: "김은미" });
    insertPlan(db, { status: "in_progress", assignee: "김은미", end_date: "2026-09-30" });
    insertPlan(db, { status: "in_progress", assignee: "김은미", end_date: "2026-10-30" });
    insertPlan(db, { status: "review", assignee: "다른사람" });

    expect(countTodo(db, true, "박성준", "2026-10-01")).toBe(1);
    expect(countTodo(db, false, "김은미", "2026-10-01")).toBe(2);
    expect(countTodo(db, false, null, "2026-10-01")).toBe(0);
  });
});
