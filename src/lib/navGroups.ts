export interface NavItem {
  href: string;
  label: string;
  subgroup?: string; // "원재료·문서"처럼 항목이 많은 그룹 안에서 중분류로 묶어 색으로 구분할 때 사용
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// 사이드바 맨 위에 고정 노출할 자주 쓰는 입력 화면 3종 (href는 NAV_GROUPS의 항목과 같은 값을 가리킨다).
export const QUICK_ACCESS_HREFS = ["/production", "/packing/entry", "/raw-material/entry"];

// 외국인 근로자와 연동된 계정은 생산·품질/제품포장만 이용할 수 있다.
export const FOREIGN_WORKER_RESTRICTED_GROUPS = new Set([
  "원재료·문서",
  "근태",
  "게시판",
  "시스템",
]);

// 특정 개인(이름)에게만 숨기는 메뉴. 근로자 단위의 세부 권한 체계가 아직 없어
// 요청받은 이름을 그대로 매칭한다 — 근로자명부 이름이 바뀌면 이 목록도 함께 갱신해야 한다.
export const NAME_RESTRICTED_GROUPS = new Set(["원재료·문서"]);
export const NAME_RESTRICTED_DISPLAY_NAMES = new Set(["김상순", "김춘수", "이재혁"]);

// 근태관리 화면에서 관리자(공용 비밀번호)와 동일한 권한(반려·일일 출근부·연차현황 전체 등)을
// 부여할 특정 개인(이름). 근로자 단위의 세부 권한 체계가 아직 없어 이름을 그대로 매칭한다.
export const ATTENDANCE_ADMIN_DISPLAY_NAMES = new Set(["박미정"]);

// 관리자(공용 비밀번호) 세션은 어떤 메뉴도 제한하지 않는다 — 관리자로 로그인하며 입력한
// 이름이 우연히 제한 대상 이름과 같아도 차단되지 않도록 isAdmin을 최우선으로 확인한다.
export function isGroupBlockedForSession(
  groupLabel: string,
  isForeignWorker: boolean,
  displayName: string | null | undefined,
  isAdmin = false
): boolean {
  if (isAdmin) return false;
  if (isForeignWorker && FOREIGN_WORKER_RESTRICTED_GROUPS.has(groupLabel)) return true;
  if (displayName && NAME_RESTRICTED_GROUPS.has(groupLabel) && NAME_RESTRICTED_DISPLAY_NAMES.has(displayName)) {
    return true;
  }
  return false;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "생산·품질",
    items: [
      { href: "/production", label: "생산일지 입력" },
      { href: "/daily", label: "일자별 요약" },
      { href: "/monthly", label: "월별 요약" },
      { href: "/electricity", label: "전력 모니터링" },
      { href: "/utility", label: "월별 유틸리티" },
      { href: "/utility/billing", label: "실청구금액 입력" },
      { href: "/qc", label: "측정데이터" },
      { href: "/dashboard", label: "품질 요약" },
    ],
  },
  {
    label: "제품포장",
    items: [
      { href: "/packing", label: "재고현황" },
      { href: "/packing/log", label: "포장일지 조회" },
      { href: "/packing/production-summary", label: "생산누계" },
      { href: "/packing/entry", label: "생산/출하 입력" },
      { href: "/packing/restock", label: "입고" },
      { href: "/packing/breakage", label: "파손" },
      { href: "/packing/return", label: "반품" },
      { href: "/packing/adjustment", label: "재고조정" },
      { href: "/packing/items", label: "품목관리" },
    ],
  },
  {
    label: "원재료·문서",
    items: [
      { href: "/raw-material/entry", label: "입고검수·입력", subgroup: "원재료" },
      { href: "/raw-material/ledger", label: "입고대장", subgroup: "원재료" },
      { href: "/raw-material/inbound-summary", label: "입고누계", subgroup: "원재료" },
      { href: "/raw-material/items", label: "품목관리", subgroup: "원재료" },
      { href: "/raw-material/suppliers", label: "공급처관리", subgroup: "원재료" },
      { href: "/raw-material/nonconformance", label: "부적합이력", subgroup: "원재료" },
      { href: "/raw-material/price-history", label: "단가이력", subgroup: "원재료" },
      { href: "/raw-material/documents", label: "양식출력", subgroup: "원재료" },
      { href: "/test-reports", label: "외부기관 시험성적서", subgroup: "문서" },
      { href: "/msds", label: "MSDS", subgroup: "문서" },
      { href: "/self-test", label: "자체시험성적서", subgroup: "문서" },
      { href: "/lab-journal", label: "연구실험일지", subgroup: "문서" },
    ],
  },
  {
    label: "근태",
    items: [{ href: "/attendance", label: "근태 신청·연차현황" }],
  },
  {
    label: "시스템",
    items: [
      { href: "/history", label: "이력 관리" },
      { href: "/import", label: "데이터 가져오기" },
      { href: "/worker", label: "근로자명부" },
      { href: "/admin", label: "관리자 설정" },
    ],
  },
];
