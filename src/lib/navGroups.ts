export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "생산가동",
    items: [
      { href: "/production", label: "생산일지 입력" },
      { href: "/daily", label: "일자별 대시보드" },
      { href: "/monthly", label: "월간 시트" },
      { href: "/electricity", label: "전력사용량" },
      { href: "/utility", label: "월별 유틸리티" },
    ],
  },
  {
    label: "품질관리",
    items: [
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
    label: "원재료관리",
    items: [
      { href: "/raw-material/entry", label: "입고검수·입력" },
      { href: "/raw-material/ledger", label: "입고대장" },
      { href: "/raw-material/inbound-summary", label: "입고누계" },
      { href: "/raw-material/items", label: "품목관리" },
      { href: "/raw-material/suppliers", label: "공급처관리" },
      { href: "/raw-material/nonconformance", label: "부적합이력" },
      { href: "/raw-material/price-history", label: "단가이력" },
      { href: "/raw-material/documents", label: "양식출력" },
    ],
  },
  {
    label: "근태관리",
    items: [{ href: "/attendance", label: "근태 신청·연차현황" }],
  },
  {
    label: "게시판",
    items: [{ href: "/board", label: "게시판" }],
  },
  {
    label: "문서관리",
    items: [
      { href: "/test-reports", label: "외부기관 시험성적서" },
      { href: "/msds", label: "MSDS" },
      { href: "/self-test", label: "자체시험성적서" },
      { href: "/lab-journal", label: "연구실험일지" },
    ],
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
