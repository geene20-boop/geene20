export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// 외국인 근로자와 연동된 계정은 생산·품질/제품포장만 이용할 수 있다.
export const FOREIGN_WORKER_RESTRICTED_GROUPS = new Set([
  "원재료·문서",
  "근태관리",
  "게시판",
  "시스템관리",
]);

// 특정 개인(이름)에게만 숨기는 메뉴. 근로자 단위의 세부 권한 체계가 아직 없어
// 요청받은 이름을 그대로 매칭한다 — 근로자명부 이름이 바뀌면 이 목록도 함께 갱신해야 한다.
export const NAME_RESTRICTED_GROUPS = new Set(["원재료·문서"]);
export const NAME_RESTRICTED_DISPLAY_NAMES = new Set(["김상순", "김춘수", "이재혁"]);

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
      { href: "/daily", label: "일자별 대시보드" },
      { href: "/monthly", label: "월간 시트" },
      { href: "/electricity", label: "전력사용량" },
      { href: "/utility", label: "월별 유틸리티" },
      { href: "/qc", label: "QC측정 입력" },
      { href: "/dashboard", label: "통합 대시보드" },
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
      { href: "/raw-material/entry", label: "입고검수·입력" },
      { href: "/raw-material/ledger", label: "입고대장" },
      { href: "/raw-material/inbound-summary", label: "입고누계" },
      { href: "/raw-material/items", label: "품목관리" },
      { href: "/raw-material/suppliers", label: "공급처관리" },
      { href: "/raw-material/nonconformance", label: "부적합이력" },
      { href: "/raw-material/price-history", label: "단가이력" },
      { href: "/raw-material/documents", label: "양식출력" },
      { href: "/test-reports", label: "외부기관 시험성적서" },
      { href: "/msds", label: "MSDS" },
      { href: "/self-test", label: "자체시험성적서" },
      { href: "/lab-journal", label: "연구실험일지" },
    ],
  },
  {
    label: "근태관리",
    items: [{ href: "/attendance", label: "근태 신청·연차현황" }],
  },
  {
    label: "시스템관리",
    items: [
      { href: "/history", label: "이력 관리" },
      { href: "/import", label: "데이터 가져오기" },
      { href: "/worker", label: "근로자명부" },
      { href: "/admin", label: "관리자 설정" },
    ],
  },
];
