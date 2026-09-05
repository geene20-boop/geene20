const KEY = "home_inbound_pinned_materials";

// 전일현황 원재료 입고현황에서 즐겨찾기(고정)한 품목 키 목록. 오늘 입고가 없어도
// 계속 표시하기 위해 브라우저에 저장해둔다 — 서버 상태가 아니라 이 브라우저 한정 설정이다.
export function getPinnedMaterialKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function togglePinnedMaterialKey(key: string): string[] {
  const current = getPinnedMaterialKeys();
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // localStorage 사용 불가(시크릿 모드 등)한 경우 조용히 무시
    }
  }
  return next;
}
