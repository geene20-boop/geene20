import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  SITE_SESSION_COOKIE,
  createSessionToken,
  createUserSessionToken,
  hasAnyAccount,
  isLoginLocked,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAccountLogin,
  verifyAdminPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!hasAnyAccount()) {
    return NextResponse.json({ error: "아직 계정이 생성되지 않았습니다." }, { status: 409 });
  }

  const { username, password } = await req.json();
  const id = String(username ?? "").trim();
  const pw = String(password ?? "");

  const lockKey = `site:${id || "unknown"}`;
  const lockedMs = isLoginLocked(lockKey);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${Math.ceil(lockedMs / 1000)}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  // 관리자 비밀번호로도 게이트를 통과할 수 있게 해서, 개인 계정을 몰라도
  // 관리자가 /admin에서 설정을 관리할 수 있도록 함
  if (verifyAdminPassword(pw)) {
    recordLoginSuccess(lockKey);
    const token = createSessionToken("admin");
    const res = NextResponse.json({ ok: true, admin: true });
    res.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  }

  const account = id ? verifyAccountLogin(id, pw) : null;
  if (!account) {
    recordLoginFailure(lockKey);
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  recordLoginSuccess(lockKey);

  const token = createUserSessionToken(account.id, account.role);
  const res = NextResponse.json({ ok: true, role: account.role });
  res.cookies.set(SITE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
