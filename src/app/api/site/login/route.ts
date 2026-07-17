import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  SITE_SESSION_COOKIE,
  createSessionToken,
  hasSitePassword,
  isLoginLocked,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAdminPassword,
  verifySitePassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!hasSitePassword()) {
    return NextResponse.json({ error: "아직 현장 비밀번호가 설정되지 않았습니다." }, { status: 409 });
  }

  const lockKey = "site";
  const lockedMs = isLoginLocked(lockKey);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${Math.ceil(lockedMs / 1000)}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const { password } = await req.json();
  const pw = String(password ?? "");

  // 관리자 비밀번호로도 게이트를 통과할 수 있게 해서, 현장 비밀번호를 몰라도
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

  if (!verifySitePassword(pw)) {
    recordLoginFailure(lockKey);
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  recordLoginSuccess(lockKey);

  const token = createSessionToken("site");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
