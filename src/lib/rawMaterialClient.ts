// 클라이언트 화면에서 공용으로 쓰는 순수 헬퍼 (DB 접근 없음)
import { RawMaterial } from "@/lib/types";

export function materialLabel(item: Pick<RawMaterial, "key" | "name">): string {
  return `[${item.key}] ${item.name}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
