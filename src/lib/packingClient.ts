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

export function groupByKind(items: PackingItem[]): Record<string, PackingItem[]> {
  const groups: Record<string, PackingItem[]> = { product: [], bagmat: [], aux: [] };
  for (const item of items) {
    (groups[item.kind] ??= []).push(item);
  }
  return groups;
}
