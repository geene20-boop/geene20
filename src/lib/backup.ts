import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";

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
  return dest;
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
    createBackupSnapshot().catch((err) => {
      console.error("자동 백업 실패:", err);
    });
  }, BACKUP_INTERVAL_MS);
  // 서버가 막 시작됐을 때도 한 번 백업해둔다
  createBackupSnapshot().catch((err) => {
    console.error("초기 백업 실패:", err);
  });
}
