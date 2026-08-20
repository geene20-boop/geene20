import Database from "better-sqlite3";
import { deleteAttachmentFile } from "@/lib/fileStorage";

const RETENTION_DAYS = 30;

// 게시판 글은 작성일로부터 30일이 지나면 자동으로 삭제한다 (상단 고정된 글은 제외).
export function cleanupExpiredBoardPosts(db: Database.Database): void {
  const expired = db
    .prepare(
      `SELECT id FROM board_post WHERE pinned = 0 AND created_at <= datetime('now', ?)`
    )
    .all(`-${RETENTION_DAYS} days`) as { id: number }[];
  if (expired.length === 0) return;

  const attachmentStmt = db.prepare("SELECT file_path FROM board_attachment WHERE post_id = ?");
  const deleteAttachments = db.prepare("DELETE FROM board_attachment WHERE post_id = ?");
  const deletePost = db.prepare("DELETE FROM board_post WHERE id = ?");

  for (const { id } of expired) {
    const attachments = attachmentStmt.all(id) as { file_path: string }[];
    deleteAttachments.run(id);
    deletePost.run(id);
    for (const a of attachments) deleteAttachmentFile(a.file_path);
  }
}
