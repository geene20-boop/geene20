import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  hasAdminPassword,
  isLoginLocked,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAdminPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!hasAdminPassword()) {
    return NextResponse.json({ error: "먼저 관리자 비밀번호를 설정해주세요." }, { status: 409 });
  }

  const lockKey = "admin";
  const lockedMs = isLoginLocked(lockKey);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${Math.ceil(lockedMs / 1000)}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const { password, name } = await req.json();
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
  }
  if (!verifyAdminPassword(String(password ?? ""))) {
    recordLoginFailure(lockKey);
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  recordLoginSuccess(lockKey);

  const token = createSessionToken("admin", trimmedName.slice(0, 40));
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
