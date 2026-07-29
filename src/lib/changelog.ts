export interface ChangelogEntry {
  version: string;
  date: string;
  items: { title: string; desc: string }[];
}

// 새 기능을 배포할 때 배열 맨 앞에 새 항목을 추가한다 (버전 문자열은 날짜 기반 권장).
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2026.07.29",
    date: "2026-07-29",
    items: [
      { title: "로고 클릭 시 메뉴 화면 이동", desc: "어디서든 좌측 상단 로고를 누르면 전체 메뉴 목록으로 돌아갑니다." },
    ],
  },
  {
    version: "2026.07.25",
    date: "2026-07-25",
    items: [
      { title: "QC 측정입력 자동반영", desc: "버너·작업자가 생산조건에서 자동으로 채워집니다." },
      { title: "생산일지 확정 알림", desc: "매일 오전 9시, 미확정 기록이 있으면 알려드립니다." },
      { title: "재고현황 품목별 조회", desc: "기간별 생산·출하를 품목 단위로 골라볼 수 있습니다." },
      { title: "생생비타 포장용기 자동반영", desc: "10리터통/IBC TANK 선택 시 재고가 자동 차감됩니다." },
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
