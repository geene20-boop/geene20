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

export function currentMonth(): string {
  return todayStr().slice(0, 7);
}

export function shiftMonth(month: string, deltaMonths: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(year, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 7월~다음해 6월을 한 시즌(1년)으로 본다. 시즌 키는 시작연도 기준 ("2025-2026").
export function currentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function shiftSeason(season: string, deltaSeasons: number): string {
  const startYear = Number(season.slice(0, 4)) + deltaSeasons;
  return `${startYear}-${startYear + 1}`;
}

export function seasonDisplayLabel(season: string): string {
  const startYear = season.slice(0, 4);
  const endYear = season.slice(5, 9);
  return `${startYear}년 7월 ~ ${endYear}년 6월`;
}
