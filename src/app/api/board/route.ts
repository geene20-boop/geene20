import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest, isModifierRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { cleanupExpiredBoardPosts } from "@/lib/boardCleanup";
import { BoardAttachment, BoardCategory, BoardPost } from "@/lib/types";

const CATEGORIES: BoardCategory[] = ["생산계획", "보수계획", "휴무일", "기타"];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

function canWriteBoard(req: NextRequest): boolean {
  return isAdminRequest(req) || isModifierRequest(req);
}

export async function GET(req: NextRequest) {
  const db = getDb();
  cleanupExpiredBoardPosts(db);
  const category = req.nextUrl.searchParams.get("category");
  const posts = (
    category
      ? db
          .prepare("SELECT * FROM board_post WHERE category = ? ORDER BY pinned DESC, created_at DESC")
          .all(category)
      : db.prepare("SELECT * FROM board_post ORDER BY pinned DESC, created_at DESC").all()
  ) as BoardPost[];

  const attachmentStmt = db.prepare(
    "SELECT id, post_id, filename, mime_type, size FROM board_attachment WHERE post_id = ? ORDER BY id"
  );
  const result = posts.map((p) => ({
    ...p,
    attachments: attachmentStmt.all(p.id) as BoardAttachment[],
  }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!canWriteBoard(req)) {
    return NextResponse.json({ error: "게시판 글쓰기는 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const form = await req.formData();
  const category = String(form.get("category") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const body = form.get("body") ? String(form.get("body")).trim() : null;

  if (!CATEGORIES.includes(category as BoardCategory)) {
    return NextResponse.json({ error: "분류가 올바르지 않습니다." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
  }

  const author = requireActor(req, { entered_by: form.get("entered_by") });
  if (!author) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `${f.name} 파일이 15MB를 초과합니다.` }, { status: 400 });
    }
  }

  const db = getDb();
  const info = db
    .prepare("INSERT INTO board_post (category, title, body, author) VALUES (?, ?, ?, ?)")
    .run(category, title, body, author);
  const postId = info.lastInsertRowid as number;

  const insertAttachment = db.prepare(
    "INSERT INTO board_attachment (post_id, filename, mime_type, size, file_path) VALUES (?, ?, ?, ?, ?)"
  );
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const filePath = saveAttachmentFile("board", f.name, buf);
    insertAttachment.run(postId, f.name, f.type || null, f.size, filePath);
  }

  logAudit("board_post", title, "create", author, `[${category}] 첨부 ${files.length}건`);

  const post = db.prepare("SELECT * FROM board_post WHERE id = ?").get(postId) as BoardPost;
  const attachments = db
    .prepare("SELECT id, post_id, filename, mime_type, size FROM board_attachment WHERE post_id = ?")
    .all(postId) as BoardAttachment[];
  return NextResponse.json({ ...post, attachments }, { status: 201 });
}
