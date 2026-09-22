import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessNavGroup, hasAnyAccount, isEditorRequest, isSiteRequest } from "@/lib/auth";

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

// 메뉴별 접근 제한(외국인 근로자 / 지정 개인)이 API 단에도 그대로 적용되도록,
// 해당 메뉴가 쓰는 API 경로 접두사를 NAV_GROUPS 라벨과 연결한다.
// (같은 접두사로 시작하는 관련 API들도 함께 걸리도록 일부러 넓게 잡음:
//  "/api/raw-material"은 raw-material, raw-material-inbound, raw-material-supplier,
//  raw-material-document, raw-material-price-history, raw-material-inbound-summary를 모두 포함)
const GROUP_API_PREFIXES: [string, string][] = [
  ["/api/raw-material", "원재료·문서"],
  ["/api/documents", "원재료·문서"],
  ["/api/self-test", "원재료·문서"],
  ["/api/lab-journal", "원재료·문서"],
  ["/api/board", "게시판"],
];

function groupForPath(pathname: string): string | null {
  for (const [prefix, group] of GROUP_API_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}-`)) {
      return group;
    }
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  // SiteGate가 페이지 렌더링만 막고 API는 그대로 열려있던 문제 수정:
  // 계정이 하나라도 만들어진 상태라면 데이터 API도 동일하게 로그인 세션을 요구한다.
  if (hasAnyAccount()) {
    if (!isSiteRequest(request)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const group = groupForPath(pathname);
    if (group && !canAccessNavGroup(request, group)) {
      return NextResponse.json({ error: "이용 권한이 없습니다." }, { status: 403 });
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
