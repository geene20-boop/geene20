import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminName, isAdminRequest, isModifierRequest } from "@/lib/auth";
import { logAudit, requireActor } from "@/lib/audit";
import { deleteAttachmentFile } from "@/lib/fileStorage";
import { BoardAttachment, BoardPost } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare("SELECT * FROM board_post WHERE id = ?").get(id) as BoardPost | undefined;
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  const attachments = db
    .prepare("SELECT id, post_id, filename, mime_type, size FROM board_attachment WHERE post_id = ? ORDER BY id")
    .all(id) as BoardAttachment[];
  return NextResponse.json({ ...post, attachments });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req) && !isModifierRequest(req)) {
    return NextResponse.json({ error: "고정 설정은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const post = db.prepare("SELECT * FROM board_post WHERE id = ?").get(id) as BoardPost | undefined;
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json();
  const pinned = body.pinned ? 1 : 0;
  db.prepare("UPDATE board_post SET pinned = ?, updated_at = datetime('now') WHERE id = ?").run(pinned, id);

  const actor = isAdminRequest(req) ? getAdminName(req) ?? "관리자" : requireActor(req, {}) ?? "관리자";
  logAudit("board_post", post.title, "update", actor, pinned ? "상단고정" : "고정해제");

  const updated = db.prepare("SELECT * FROM board_post WHERE id = ?").get(id) as BoardPost;
  const attachments = db
    .prepare("SELECT id, post_id, filename, mime_type, size FROM board_attachment WHERE post_id = ? ORDER BY id")
    .all(id) as BoardAttachment[];
  return NextResponse.json({ ...updated, attachments });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req) && !isModifierRequest(req)) {
    return NextResponse.json({ error: "게시글 삭제는 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const post = db.prepare("SELECT * FROM board_post WHERE id = ?").get(id) as BoardPost | undefined;
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

  const attachments = db
    .prepare("SELECT file_path FROM board_attachment WHERE post_id = ?")
    .all(id) as { file_path: string }[];

  db.prepare("DELETE FROM board_attachment WHERE post_id = ?").run(id);
  db.prepare("DELETE FROM board_post WHERE id = ?").run(id);
  for (const a of attachments) deleteAttachmentFile(a.file_path);

  const actor = isAdminRequest(req) ? getAdminName(req) ?? "관리자" : requireActor(req, {}) ?? "관리자";
  logAudit("board_post", post.title, "delete", actor);
  return NextResponse.json({ ok: true });
}
