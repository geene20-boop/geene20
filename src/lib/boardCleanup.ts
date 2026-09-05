import Database from "better-sqlite3";
import { deleteAttachmentFile } from "@/lib/fileStorage";
import { logAudit } from "@/lib/audit";

const RETENTION_DAYS = 30;
const AUTO_DELETE_ACTOR = "시스템(자동삭제)";

// 게시판 글은 작성일로부터 30일이 지나면 자동으로 삭제한다 (상단 고정된 글은 제외).
// 나중에 "이 글이 왜 사라졌는지" 추적할 수 있도록 수동 삭제와 동일하게 감사 로그를 남긴다.
export function cleanupExpiredBoardPosts(db: Database.Database): void {
  const expired = db
    .prepare(
      `SELECT id, title, created_at FROM board_post WHERE pinned = 0 AND created_at <= datetime('now', ?)`
    )
    .all(`-${RETENTION_DAYS} days`) as { id: number; title: string; created_at: string }[];
  if (expired.length === 0) return;

  const attachmentStmt = db.prepare("SELECT file_path FROM board_attachment WHERE post_id = ?");
  const deleteAttachments = db.prepare("DELETE FROM board_attachment WHERE post_id = ?");
  const deletePost = db.prepare("DELETE FROM board_post WHERE id = ?");

  for (const { id, title, created_at } of expired) {
    const attachments = attachmentStmt.all(id) as { file_path: string }[];
    deleteAttachments.run(id);
    deletePost.run(id);
    for (const a of attachments) deleteAttachmentFile(a.file_path);
    logAudit(
      "board_post",
      title,
      "delete",
      AUTO_DELETE_ACTOR,
      `작성일 ${created_at} · ${RETENTION_DAYS}일 경과 자동삭제`,
      db
    );
  }
}
