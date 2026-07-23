import Database from "better-sqlite3";

export interface CategoryTons {
  category: string; // "석회고토" | "입상규산" | "칼슘유황"
  tons: number;
}

export interface DailyShipmentRow {
  date: string; // "YYYY-MM-DD"
  tons: number;
  dodTons: number | null; // 전일 대비 증감(톤)
  dodPercent: number | null; // 전일 대비 증감(%)
}

export interface MonthlyShipmentRow {
  month: string; // "YYYY-MM"
  tons: number;
  byCategory: CategoryTons[];
  momTons: number | null; // 전월(직전월) 대비 증감(톤)
  momPercent: number | null; // 전월 대비 증감(%)
  yoyTons: number | null; // 전년 동월 대비 증감(톤)
  yoyPercent: number | null; // 전년 동월 대비 증감(%)
}

export interface SeasonShipmentRow {
  season: string; // "2025-2026" (2025년 7월 ~ 2026년 6월)
  tons: number;
  byCategory: CategoryTons[];
  yoyTons: number | null; // 전 시즌 대비 증감(톤)
  yoyPercent: number | null; // 전 시즌 대비 증감(%)
}

const DISPLAY_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"];

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

// 전년 동월(12개월 전)
function prevYearSameMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, m - 1 - 12, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 직전 달(1개월 전)
function prevCalendarMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, m - 1 - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevSeasonKey(season: string): string {
  const startYear = Number(season.slice(0, 4));
  return `${startYear - 1}-${startYear}`;
}

function shiftDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface RawEntry {
  date: string;
  qty: number;
  bag_kg: number | null;
  category: string | null;
  sub: string | null;
}

function getRawEntries(db: Database.Database): RawEntry[] {
  return db
    .prepare(
      `SELECT pe.date as date, pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category, pi.sub as sub
       FROM packing_entry pe
       JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = 'ship' AND pi.kind = 'product'`
    )
    .all() as RawEntry[];
}

function tonsOf(entry: RawEntry): number {
  return (entry.qty * (entry.bag_kg ?? 0)) / 1000;
}

// 품목 대분류(석회고토/입상규산/칼슘유황) 분류. 톤백 제품은 category가 "톤백"이라
// sub(세부명)에 적힌 이름으로 상위 대분류를 찾는다. 어디에도 안 걸리면(예: 생생비타) null.
function classifyCategory(category: string | null, sub: string | null): string | null {
  const cat = category ?? "";
  if (cat.includes("입상규산")) return "입상규산";
  if (cat.includes("석회고토")) return "석회고토";
  if (cat.includes("칼슘") || cat.includes("유황")) return "칼슘유황";
  if (cat === "톤백") {
    const s = sub ?? "";
    if (s.includes("석회고토")) return "석회고토";
    if (s.includes("규산")) return "입상규산";
    if (s.includes("칼슘") || s.includes("유황")) return "칼슘유황";
  }
  return null;
}

function withDelta<T extends { tons: number }>(
  sortedKeys: string[],
  tonsByKey: Map<string, number>,
  prevKeyOf: (key: string) => string,
  build: (key: string, tons: number, deltaTons: number | null, deltaPercent: number | null) => T
): T[] {
  return sortedKeys.map((key) => {
    const tons = tonsByKey.get(key)!;
    const prevTons = tonsByKey.get(prevKeyOf(key)) ?? null;
    const deltaTons = prevTons != null ? tons - prevTons : null;
    const deltaPercent = prevTons != null && prevTons !== 0 ? ((deltaTons as number) / prevTons) * 100 : null;
    return build(key, tons, deltaTons, deltaPercent);
  });
}

function byCategoryOf(catMap: Map<string, number> | undefined): CategoryTons[] {
  return DISPLAY_CATEGORIES.map((category) => ({ category, tons: catMap?.get(category) ?? 0 }));
}

// 조회기간(from~to) 내 날짜별 출하량과 전일대비 증감을 계산한다.
// 전일대비는 조회기간 밖의 전날 실적도 참고해서(그래야 조회기간 첫날도 증감 계산 가능) 계산한다.
export function getDailyShipment(db: Database.Database, from: string, to: string): DailyShipmentRow[] {
  const entries = getRawEntries(db);
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + tonsOf(e));
  }
  const datesInRange = [...byDate.keys()].filter((d) => d >= from && d <= to).sort();
  return datesInRange.map((date) => {
    const tons = byDate.get(date)!;
    const prevTons = byDate.get(shiftDateStr(date, -1)) ?? null;
    const dodTons = prevTons != null ? tons - prevTons : null;
    const dodPercent = prevTons != null && prevTons !== 0 ? ((dodTons as number) / prevTons) * 100 : null;
    return { date, tons, dodTons, dodPercent };
  });
}

export function getMonthlyShipment(db: Database.Database): MonthlyShipmentRow[] {
  const entries = getRawEntries(db);
  const byMonth = new Map<string, number>();
  const byMonthCategory = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const month = monthKey(e.date);
    const tons = tonsOf(e);
    byMonth.set(month, (byMonth.get(month) ?? 0) + tons);
    const category = classifyCategory(e.category, e.sub);
    if (category) {
      const catMap = byMonthCategory.get(month) ?? new Map<string, number>();
      catMap.set(category, (catMap.get(category) ?? 0) + tons);
      byMonthCategory.set(month, catMap);
    }
  }
  const months = [...byMonth.keys()].sort();
  const withYoy = withDelta(months, byMonth, prevYearSameMonthKey, (month, tons, yoyTons, yoyPercent) => ({
    month,
    tons,
    yoyTons,
    yoyPercent,
  }));
  return withYoy.map((row) => {
    const prevMonthTons = byMonth.get(prevCalendarMonthKey(row.month)) ?? null;
    const momTons = prevMonthTons != null ? row.tons - prevMonthTons : null;
    const momPercent = prevMonthTons != null && prevMonthTons !== 0 ? ((momTons as number) / prevMonthTons) * 100 : null;
    return {
      month: row.month,
      tons: row.tons,
      byCategory: byCategoryOf(byMonthCategory.get(row.month)),
      momTons,
      momPercent,
      yoyTons: row.yoyTons,
      yoyPercent: row.yoyPercent,
    };
  });
}

export function getSeasonShipment(db: Database.Database): SeasonShipmentRow[] {
  const entries = getRawEntries(db);
  const bySeason = new Map<string, number>();
  const bySeasonCategory = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const season = seasonKey(e.date);
    const tons = tonsOf(e);
    bySeason.set(season, (bySeason.get(season) ?? 0) + tons);
    const category = classifyCategory(e.category, e.sub);
    if (category) {
      const catMap = bySeasonCategory.get(season) ?? new Map<string, number>();
      catMap.set(category, (catMap.get(category) ?? 0) + tons);
      bySeasonCategory.set(season, catMap);
    }
  }
  const seasons = [...bySeason.keys()].sort();
  return withDelta(seasons, bySeason, prevSeasonKey, (season, tons, yoyTons, yoyPercent) => ({
    season,
    tons,
    byCategory: byCategoryOf(bySeasonCategory.get(season)),
    yoyTons,
    yoyPercent,
  }));
}
