import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { ATTACHMENTS_DIR } from "@/lib/fileStorage";

// Railway 볼륨(로컬 스냅샷 + 첨부파일 미러)이 그대로 손상되면 DB 백업과 첨부파일이
// 한꺼번에 사라진다. 여기서는 그 볼륨 밖(Cloudflare R2)에 진짜 오프사이트 사본을 둔다.
// 이메일 백업과 달리 DB뿐 아니라 첨부파일도 포함하고, 발송 용량 제한도 없다.

const DB_BACKUP_KEEP = 60; // 6시간 주기 기준 약 15일치
const PREFIX_DB = "db-backups/";
const PREFIX_ATTACHMENTS = "attachments/";
const LAST_SYNC_KEY = "offsite_backup_last_sync_at";

export function isOffsiteBackupConfigured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export function getOffsiteBackupLastSync(): string | null {
  return getSetting(LAST_SYNC_KEY);
}

export interface OffsiteSyncResult {
  dbUploaded: boolean;
  filesUploaded: number;
  errors: string[];
}

/** DB 스냅샷 1건 + 아직 안 올린 첨부파일을 R2에 올리고, 오래된 DB 스냅샷은 정리한다. */
export async function syncOffsiteBackup(dbSnapshotPath: string): Promise<OffsiteSyncResult> {
  const result: OffsiteSyncResult = { dbUploaded: false, filesUploaded: 0, errors: [] };
  if (!isOffsiteBackupConfigured()) return result;

  const client = getClient();
  const bucket = process.env.R2_BUCKET!;

  try {
    const body = fs.readFileSync(dbSnapshotPath);
    const key = `${PREFIX_DB}${path.basename(dbSnapshotPath)}`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    result.dbUploaded = true;
    await pruneOldOffsiteDbBackups(client, bucket);
  } catch (err) {
    result.errors.push(`DB 백업 업로드 실패: ${(err as Error).message}`);
  }

  try {
    result.filesUploaded = await uploadNewAttachments(client, bucket);
  } catch (err) {
    result.errors.push(`첨부파일 업로드 실패: ${(err as Error).message}`);
  }

  setSetting(LAST_SYNC_KEY, new Date().toISOString());
  return result;
}

async function pruneOldOffsiteDbBackups(client: S3Client, bucket: string): Promise<void> {
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX_DB }));
  const keys = (listed.Contents ?? [])
    .map((o) => o.Key)
    .filter((k): k is string => !!k)
    .sort();
  const excess = keys.length - DB_BACKUP_KEEP;
  for (let i = 0; i < excess; i++) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keys[i] }));
  }
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

async function uploadNewAttachments(client: S3Client, bucket: string): Promise<number> {
  const db = getDb();
  const already = new Set(
    (db.prepare("SELECT file_path FROM offsite_upload_log").all() as { file_path: string }[]).map(
      (r) => r.file_path
    )
  );

  const markUploaded = db.prepare(
    "INSERT INTO offsite_upload_log (file_path) VALUES (?) ON CONFLICT(file_path) DO NOTHING"
  );

  let uploaded = 0;
  for (const fullPath of walkFiles(ATTACHMENTS_DIR)) {
    const relPath = path.relative(ATTACHMENTS_DIR, fullPath);
    if (already.has(relPath)) continue;
    const body = fs.readFileSync(fullPath);
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: `${PREFIX_ATTACHMENTS}${relPath}`, Body: body })
    );
    markUploaded.run(relPath);
    uploaded++;
  }
  return uploaded;
}
