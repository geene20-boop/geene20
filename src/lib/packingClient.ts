// 클라이언트 화면에서 공용으로 쓰는 순수 헬퍼 (DB 접근 없음)
import { PackingItem } from "@/lib/types";

export const KIND_LABELS: Record<string, string> = {
  product: "제품",
  bagmat: "포장지",
  aux: "부자재",
};

export function itemLabel(item: PackingItem): string {
  return [item.category, item.sub].filter(Boolean).join(" ") || item.key;
}

// 실제 품목 데이터의 category/sub 앞에는 "[01]", "[A]"처럼 내부 관리번호가 붙어있을 수 있어
// (예: "[04]톤백", "[1-D]석회고토(1T)") 매칭·표시 전에 앞쪽 대괄호 코드를 떼어낸다.
export function stripCode(s: string | null): string {
  return (s ?? "").replace(/^\[[^\]]+\]\s*/, "").trim();
}

export function groupByKind(items: PackingItem[]): Record<string, PackingItem[]> {
  const groups: Record<string, PackingItem[]> = { product: [], bagmat: [], aux: [] };
  for (const item of items) {
    (groups[item.kind] ??= []).push(item);
  }
  return groups;
}
