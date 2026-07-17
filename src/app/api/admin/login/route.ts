import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createSessionToken, hasAdminPassword, verifyAdminPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!hasAdminPassword()) {
    return NextResponse.json({ error: "먼저 관리자 비밀번호를 설정해주세요." }, { status: 409 });
  }
  const { password } = await req.json();
  if (!verifyAdminPassword(String(password ?? ""))) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = createSessionToken();
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
