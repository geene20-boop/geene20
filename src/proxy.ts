import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAnyAccount, isEditorRequest, isSiteRequest } from "@/lib/auth";

// 로그인/세션 확인 자체는 인증 여부와 무관하게 항상 호출 가능해야 함
const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/site/login",
  "/api/site/logout",
  "/api/site/session",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/session",
  "/api/admin/setup",
  "/api/admin/recover",
]);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// 근태 신청/취소는 생산·품질 데이터 편집 권한(editor 이상)과 무관하게, 로그인한
// 개인계정(viewer 포함)이라면 누구나 본인 건에 한해 쓸 수 있어야 하는 self-service 기능이라
// editor 이상 요구 규칙에서 제외한다. 세부 권한(본인 소유 확인, 승인은 관리자만 등)은
// 각 라우트 핸들러가 담당한다.
const SELF_SERVICE_WRITE_PREFIXES = ["/api/leave-request"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  // SiteGate가 페이지 렌더링만 막고 API는 그대로 열려있던 문제 수정:
  // 계정이 하나라도 만들어진 상태라면 데이터 API도 동일하게 로그인 세션을 요구한다.
  if (hasAnyAccount()) {
    if (!isSiteRequest(request)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const isSelfService = SELF_SERVICE_WRITE_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    // 조회(GET)는 viewer도 가능하지만, 저장·수정·삭제는 editor 이상만 가능 (근태 신청 제외)
    if (WRITE_METHODS.has(request.method) && !isEditorRequest(request) && !isSelfService) {
      return NextResponse.json({ error: "조회 권한으로는 저장할 수 없습니다." }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
