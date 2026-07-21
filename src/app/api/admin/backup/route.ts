import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { createBackupSnapshot, listBackups } from "@/lib/backup";
import { isBackupEmailConfigured } from "@/lib/backupMailer";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  return NextResponse.json({ backups: listBackups(), emailConfigured: isBackupEmailConfigured() });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const path = await createBackupSnapshot();
  return NextResponse.json({ ok: true, path, backups: listBackups() });
}
