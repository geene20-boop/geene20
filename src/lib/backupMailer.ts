import nodemailer from "nodemailer";
import path from "path";
import { getBackupFilePath, listBackups } from "@/lib/backup";

const EMAIL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간마다 1회

export function isBackupEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.BACKUP_EMAIL_TO
  );
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // 465(SSL)면 true, 587(STARTTLS)면 false
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendBackupEmail(filePath: string): Promise<void> {
  if (!isBackupEmailConfigured()) {
    throw new Error(
      "이메일 백업이 설정되지 않았습니다. SMTP_HOST, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO 환경변수를 먼저 설정해주세요."
    );
  }
  const transporter = getTransporter();
  const fileName = path.basename(filePath);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.BACKUP_EMAIL_TO,
    subject: `[HANIL QC] 데이터베이스 백업 (${fileName})`,
    text: `자동 생성된 데이터베이스 백업 파일을 첨부합니다.\n\n파일명: ${fileName}\n생성 시각: ${new Date().toLocaleString(
      "ko-KR"
    )}\n\n이 이메일은 서버가 자동으로 보낸 것입니다.`,
    attachments: [{ filename: fileName, path: filePath }],
  });
}

/** 서버에 저장된 백업 중 가장 최근 것을 이메일로 발송한다. */
export async function sendLatestBackupEmail(): Promise<void> {
  const backups = listBackups();
  if (backups.length === 0) throw new Error("발송할 백업 파일이 없습니다.");
  const filePath = getBackupFilePath(backups[0].name);
  if (!filePath) throw new Error("백업 파일을 찾을 수 없습니다.");
  await sendBackupEmail(filePath);
}

declare global {
  var __backupEmailTimer: NodeJS.Timeout | undefined;
}

export function ensureBackupEmailScheduler(): void {
  if (!isBackupEmailConfigured()) return;
  if (global.__backupEmailTimer) return;
  global.__backupEmailTimer = setInterval(() => {
    sendLatestBackupEmail().catch((err) => {
      console.error("백업 이메일 자동 발송 실패:", err);
    });
  }, EMAIL_INTERVAL_MS);
}
