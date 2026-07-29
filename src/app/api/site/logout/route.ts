import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, SITE_SESSION_COOKIE } from "@/lib/auth";

// 공용 관리자 비밀번호로 로그인한 경우 site_session이 아니라 admin_session이 설정되므로,
// "로그아웃"은 어느 쪽으로 로그인했든 두 세션 쿠키를 모두 정리해야 로그인 화면으로 돌아간다.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
