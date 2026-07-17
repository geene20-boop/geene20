import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { createBackupSnapshot, getBackupFilePath } from "@/lib/backup";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");

  const filePath = name ? getBackupFilePath(name) : await createBackupSnapshot();
  if (!filePath) {
    return NextResponse.json({ error: "백업 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const fileName = filePath.split("/").pop() ?? "backup.db";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
