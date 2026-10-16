import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
export const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments");

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[/\\]/g, "_");
  return base.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 150) || "file";
}

/** BLOB을 별도 파일로 저장하고, DB에 저장할 상대경로(예: "board/ab12-원본이름.pdf")를 반환한다. */
export function saveAttachmentFile(category: string, filename: string, data: Buffer): string {
  const dir = path.join(ATTACHMENTS_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
  fs.writeFileSync(path.join(dir, storedName), data);
  return path.join(category, storedName);
}

export function readAttachmentFile(relPath: string): Buffer {
  return fs.readFileSync(path.join(ATTACHMENTS_DIR, relPath));
}

export function deleteAttachmentFile(relPath: string): void {
  try {
    fs.unlinkSync(path.join(ATTACHMENTS_DIR, relPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
