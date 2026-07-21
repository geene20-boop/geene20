import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, setAdminPassword, verifyAdminPassword } from "@/lib/auth";

// 이미 로그인한 관리자가 스스로 비밀번호를 바꾸는 기능 (복구 코드 없이도 가능)
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { currentPassword, newPassword } = await req.json();
  if (!verifyAdminPassword(String(currentPassword ?? ""))) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  if (!newPassword || String(newPassword).length < 8) {
    return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }

  setAdminPassword(String(newPassword));
  return NextResponse.json({ ok: true });
}
