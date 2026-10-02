import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { ATTACHMENTS_DIR } from "@/lib/fileStorage";
import { syncOffsiteBackup } from "@/lib/offsiteBackup";

const BACKUP_KEEP = 14; // 최근 백업 보관 개수
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6시간마다 자동 스냅샷

function backupDir(): string {
  const dir = path.join(path.dirname(dbPath()), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(): string {
  const dataDir = process.env.DB_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "app.db");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export async function createBackupSnapshot(): Promise<string> {
  const db = getDb();
  const dest = path.join(backupDir(), `app-${timestamp()}.db`);
  await db.backup(dest);
  pruneOldBackups();
  mirrorAttachments();
  return dest;
}

// 로컬 스냅샷을 만들고, 그걸 로컬 볼륨 밖(R2)으로도 올린다. 오프사이트가 설정 안 돼 있으면
// syncOffsiteBackup이 조용히 스킵한다. 자동 백업 주기와 관리자 화면의 수동 버튼이 이 함수를
// 함께 쓴다.
export async function createBackupAndSyncOffsite() {
  const dest = await createBackupSnapshot();
  return syncOffsiteBackup(dest);
}

// 첨부파일(게시판/문서관리)은 DB 밖 파일로 저장되므로 db.backup()에 포함되지 않는다.
// 파일은 한 번 올라오면 내용이 바뀌지 않으므로(생성/삭제만 있음), 스냅샷마다 전부 복사하는 대신
// 아직 미러에 없는 파일만 추가로 복사해 최신 상태를 한 벌만 유지한다.
function mirrorAttachments(): void {
  if (!fs.existsSync(ATTACHMENTS_DIR)) return;
  const dest = path.join(backupDir(), "attachments");
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  copyMissingFiles(ATTACHMENTS_DIR, dest);
}

function copyMissingFiles(srcDir: string, destDir: string): void {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyMissingFiles(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function pruneOldBackups(): void {
  const dir = backupDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .sort();
  const excess = files.length - BACKUP_KEEP;
  for (let i = 0; i < excess; i++) {
    fs.unlinkSync(path.join(dir, files[i]));
  }
}

export function listBackups(): { name: string; sizeBytes: number; createdAt: string }[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getBackupFilePath(name: string): string | null {
  const dir = backupDir();
  const safeName = path.basename(name);
  const full = path.join(dir, safeName);
  return fs.existsSync(full) ? full : null;
}

export function getCurrentDbPath(): string {
  return dbPath();
}

declare global {
  var __backupTimer: NodeJS.Timeout | undefined;
}

export function ensureBackupScheduler(): void {
  if (global.__backupTimer) return;
  global.__backupTimer = setInterval(() => {
    createBackupAndSyncOffsite().catch((err) => {
      console.error("자동 백업 실패:", err);
    });
  }, BACKUP_INTERVAL_MS);
  // 서버가 막 시작됐을 때도 한 번 백업해둔다
  createBackupAndSyncOffsite().catch((err) => {
    console.error("초기 백업 실패:", err);
  });
}
