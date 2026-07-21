import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  hasRecoveryCodeConfigured,
  setAdminPassword,
  verifyRecoveryCode,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!hasRecoveryCodeConfigured()) {
    return NextResponse.json(
      { error: "이 서버에는 복구 코드(ADMIN_RECOVERY_CODE)가 설정되어 있지 않습니다." },
      { status: 409 }
    );
  }

  const { code, newPassword } = await req.json();
  if (!verifyRecoveryCode(String(code ?? ""))) {
    return NextResponse.json({ error: "복구 코드가 올바르지 않습니다." }, { status: 401 });
  }
  if (!newPassword || String(newPassword).length < 8) {
    return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }

  setAdminPassword(String(newPassword));
  const token = createSessionToken("admin");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
