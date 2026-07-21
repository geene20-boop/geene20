import Database from "better-sqlite3";

export interface MonthlyProductionRow {
  month: string; // "YYYY-MM"
  tons: number;
  yoyTons: number | null; // 전년 동월 대비 증감(톤)
  yoyPercent: number | null; // 전년 동월 대비 증감(%)
}

export interface SeasonProductionRow {
  season: string; // "2025-2026" (2025년 7월 ~ 2026년 6월)
  tons: number;
  yoyTons: number | null; // 전 시즌 대비 증감(톤)
  yoyPercent: number | null; // 전 시즌 대비 증감(%)
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// 7월~다음해 6월을 한 시즌(1년)으로 본다. 시즌 키는 시작연도 기준.
function seasonKey(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function prevMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, m - 1 - 12, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevSeasonKey(season: string): string {
  const startYear = Number(season.slice(0, 4));
  return `${startYear - 1}-${startYear}`;
}

interface RawEntry {
  date: string;
  qty: number;
  bag_kg: number | null;
}

function getRawEntries(db: Database.Database): RawEntry[] {
  return db
    .prepare(
      `SELECT pe.date as date, pe.qty as qty, pi.bag_kg as bag_kg
       FROM packing_entry pe
       JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = 'pack' AND pi.kind = 'product'`
    )
    .all() as RawEntry[];
}

function tonsOf(entry: RawEntry): number {
  return (entry.qty * (entry.bag_kg ?? 0)) / 1000;
}

function withYoy<T extends { tons: number }>(
  sortedKeys: string[],
  tonsByKey: Map<string, number>,
  prevKeyOf: (key: string) => string,
  build: (key: string, tons: number, yoyTons: number | null, yoyPercent: number | null) => T
): T[] {
  return sortedKeys.map((key) => {
    const tons = tonsByKey.get(key)!;
    const prevTons = tonsByKey.get(prevKeyOf(key)) ?? null;
    const yoyTons = prevTons != null ? tons - prevTons : null;
    const yoyPercent = prevTons != null && prevTons !== 0 ? ((yoyTons as number) / prevTons) * 100 : null;
    return build(key, tons, yoyTons, yoyPercent);
  });
}

export function getMonthlyProduction(db: Database.Database): MonthlyProductionRow[] {
  const entries = getRawEntries(db);
  const byMonth = new Map<string, number>();
  for (const e of entries) {
    const key = monthKey(e.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + tonsOf(e));
  }
  const months = [...byMonth.keys()].sort();
  return withYoy(months, byMonth, prevMonthKey, (month, tons, yoyTons, yoyPercent) => ({
    month,
    tons,
    yoyTons,
    yoyPercent,
  }));
}

export function getSeasonProduction(db: Database.Database): SeasonProductionRow[] {
  const entries = getRawEntries(db);
  const bySeason = new Map<string, number>();
  for (const e of entries) {
    const key = seasonKey(e.date);
    bySeason.set(key, (bySeason.get(key) ?? 0) + tonsOf(e));
  }
  const seasons = [...bySeason.keys()].sort();
  return withYoy(seasons, bySeason, prevSeasonKey, (season, tons, yoyTons, yoyPercent) => ({
    season,
    tons,
    yoyTons,
    yoyPercent,
  }));
}
