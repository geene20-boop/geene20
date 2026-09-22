import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { createBackupAndSyncOffsite } from "@/lib/backup";
import { isOffsiteBackupConfigured } from "@/lib/offsiteBackup";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  if (!isOffsiteBackupConfigured()) {
    return NextResponse.json(
      { error: "오프사이트 백업이 설정되지 않았습니다. R2 환경변수를 먼저 추가해주세요." },
      { status: 400 }
    );
  }
  const result = await createBackupAndSyncOffsite();
  if (result.errors.length > 0) {
    return NextResponse.json({ error: result.errors.join(" / "), result }, { status: 502 });
  }
  return NextResponse.json({ ok: true, result });
}
