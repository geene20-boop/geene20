import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSitePassword, isSiteRequest } from "@/lib/auth";

// 로그인/세션 확인 자체는 인증 여부와 무관하게 항상 호출 가능해야 함
const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/site/login",
  "/api/site/logout",
  "/api/site/session",
  "/api/site/setup",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/session",
  "/api/admin/setup",
  "/api/admin/recover",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  // SiteGate가 페이지 렌더링만 막고 API는 그대로 열려있던 문제 수정:
  // 현장 비밀번호가 설정된 경우 데이터 API도 동일하게 세션을 요구한다.
  if (hasSitePassword() && !isSiteRequest(request)) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
