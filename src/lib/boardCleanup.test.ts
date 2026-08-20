import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { cleanupExpiredBoardPosts } from "@/lib/boardCleanup";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE board_post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      author TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE board_attachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function insertPost(
  db: Database.Database,
  { title, pinned, daysAgo }: { title: string; pinned: number; daysAgo: number }
): number {
  const info = db
    .prepare(
      `INSERT INTO board_post (category, title, author, pinned, created_at)
       VALUES ('기타', ?, '작성자', ?, datetime('now', ?))`
    )
    .run(title, pinned, `-${daysAgo} days`);
  return info.lastInsertRowid as number;
}

describe("cleanupExpiredBoardPosts", () => {
  it("30일이 지난 일반 게시글은 삭제한다", () => {
    const db = makeDb();
    insertPost(db, { title: "오래된 글", pinned: 0, daysAgo: 31 });
    const recentId = insertPost(db, { title: "최근 글", pinned: 0, daysAgo: 1 });

    cleanupExpiredBoardPosts(db);

    const remaining = db.prepare("SELECT id, title FROM board_post").all() as { id: number; title: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(recentId);
  });

  it("30일이 지나도 고정된 게시글은 삭제하지 않는다", () => {
    const db = makeDb();
    insertPost(db, { title: "오래된 고정 글", pinned: 1, daysAgo: 60 });

    cleanupExpiredBoardPosts(db);

    const remaining = db.prepare("SELECT id FROM board_post").all();
    expect(remaining).toHaveLength(1);
  });

  it("정확히 경계(30일)에 걸친 글도 삭제한다", () => {
    const db = makeDb();
    insertPost(db, { title: "딱 30일", pinned: 0, daysAgo: 30 });

    cleanupExpiredBoardPosts(db);

    const remaining = db.prepare("SELECT id FROM board_post").all();
    expect(remaining).toHaveLength(0);
  });

  it("삭제되는 게시글의 첨부 레코드도 함께 삭제한다", () => {
    const db = makeDb();
    const postId = insertPost(db, { title: "오래된 글", pinned: 0, daysAgo: 40 });
    db.prepare(
      "INSERT INTO board_attachment (post_id, filename, size, file_path) VALUES (?, 'a.pdf', 10, 'board/a.pdf')"
    ).run(postId);

    cleanupExpiredBoardPosts(db);

    const attachments = db.prepare("SELECT id FROM board_attachment").all();
    expect(attachments).toHaveLength(0);
  });
});
