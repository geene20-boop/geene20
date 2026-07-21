import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createSessionToken, hasAdminPassword, setAdminPassword } from "@/lib/auth";

// 최초 1회: 관리자 비밀번호가 아직 설정되지 않았을 때만 허용
export async function POST(req: NextRequest) {
  if (hasAdminPassword()) {
    return NextResponse.json({ error: "이미 관리자 비밀번호가 설정되어 있습니다." }, { status: 409 });
  }
  const { password } = await req.json();
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }

  setAdminPassword(String(password));
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
