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

export interface DailyProductionRow {
  date: string; // "YYYY-MM-DD"
  tons: number;
  dodTons: number | null; // 전일 대비 증감(톤)
  dodPercent: number | null; // 전일 대비 증감(%)
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

function shiftDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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

const PRODUCT_CATEGORIES = ["입상규산", "석회고토", "칼슘유황"];

// 품목명(카테고리)에 생산품목 분류명이 들어있으면 그 분류로 본다 (예: "톤백 규산"엔 안 걸림)
export function classifyProductCategory(name: string): string | null {
  return PRODUCT_CATEGORIES.find((c) => name.includes(c)) ?? null;
}

export interface DailyPackingSummary {
  totalTons: number; // 그날 포장된 전체 톤수(분류 무관, type='pack' 전체)
  suggestedProduct: string | null; // 톤수가 가장 큰 분류(입상규산/석회고토/칼슘유황)
}

// 생산일지 "일일포장량/생산품목" 자동 반영용: 제품포장(packing_entry)에 그날 입력된
// 생산제품+수량을 톤으로 환산해 합계 내고, 분류별 톤수가 가장 큰 것을 생산품목으로 제안한다.
export function getDailyPackingSummary(db: Database.Database, date: string): DailyPackingSummary {
  const rows = db
    .prepare(
      `SELECT pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category
       FROM packing_entry pe
       JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = 'pack' AND pi.kind = 'product' AND pe.date = ?`
    )
    .all(date) as { qty: number; bag_kg: number | null; category: string | null }[];

  let totalTons = 0;
  const tonsByCategory = new Map<string, number>();
  for (const row of rows) {
    const tons = (row.qty * (row.bag_kg ?? 0)) / 1000;
    totalTons += tons;
    const category = row.category ? classifyProductCategory(row.category) : null;
    if (category) tonsByCategory.set(category, (tonsByCategory.get(category) ?? 0) + tons);
  }

  let suggestedProduct: string | null = null;
  let maxTons = 0;
  for (const [category, tons] of tonsByCategory) {
    if (tons > maxTons) {
      maxTons = tons;
      suggestedProduct = category;
    }
  }

  return { totalTons, suggestedProduct };
}

// 조회기간(from~to) 내 날짜별 생산량과 전일대비 증감을 계산한다.
// 전일대비는 조회기간 밖의 전날 실적도 참고해서(그래야 조회기간 첫날도 증감 계산 가능) 계산한다.
export function getDailyProduction(db: Database.Database, from: string, to: string): DailyProductionRow[] {
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

// ---------- 비종별(대분류) 내역 포함 월별/시즌별 생산누계 ----------
// 위 getMonthlyProduction/getSeasonProduction(합계만)과 별개로, 대분류별 내역이 필요한
// 화면(생산누계의 "월별 비종별"/"연간 비종별" 탭) 전용으로 추가했다.

export interface CategoryTons {
  category: string; // "석회고토" | "입상규산" | "칼슘유황"
  tons: number;
}

export interface MonthlyProductionByCategoryRow {
  month: string; // "YYYY-MM"
  tons: number;
  byCategory: CategoryTons[];
  yoyTons: number | null; // 전년 동월 대비 증감(톤)
  yoyPercent: number | null; // 전년 동월 대비 증감(%)
}

export interface SeasonProductionByCategoryRow {
  season: string; // "2025-2026"
  tons: number;
  byCategory: CategoryTons[];
  yoyTons: number | null; // 전 시즌 대비 증감(톤)
  yoyPercent: number | null; // 전 시즌 대비 증감(%)
}

const DISPLAY_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"];

interface RawEntryWithSub {
  date: string;
  qty: number;
  bag_kg: number | null;
  category: string | null;
  sub: string | null;
}

function getRawEntriesWithSub(db: Database.Database): RawEntryWithSub[] {
  return db
    .prepare(
      `SELECT pe.date as date, pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category, pi.sub as sub
       FROM packing_entry pe
       JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = 'pack' AND pi.kind = 'product'`
    )
    .all() as RawEntryWithSub[];
}

// classifyProductCategory와 달리 톤백 제품(category="톤백")도 sub(세부명)로 상위 대분류에 포함시킨다.
function classifyCategoryWithTonbag(category: string | null, sub: string | null): string | null {
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

function byCategoryOf(catMap: Map<string, number> | undefined): CategoryTons[] {
  return DISPLAY_CATEGORIES.map((category) => ({ category, tons: catMap?.get(category) ?? 0 }));
}

export function getMonthlyProductionByCategory(db: Database.Database): MonthlyProductionByCategoryRow[] {
  const entries = getRawEntriesWithSub(db);
  const byMonth = new Map<string, number>();
  const byMonthCategory = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const month = monthKey(e.date);
    const tons = tonsOf(e);
    byMonth.set(month, (byMonth.get(month) ?? 0) + tons);
    const category = classifyCategoryWithTonbag(e.category, e.sub);
    if (category) {
      const catMap = byMonthCategory.get(month) ?? new Map<string, number>();
      catMap.set(category, (catMap.get(category) ?? 0) + tons);
      byMonthCategory.set(month, catMap);
    }
  }
  const months = [...byMonth.keys()].sort();
  return withYoy(months, byMonth, prevMonthKey, (month, tons, yoyTons, yoyPercent) => ({
    month,
    tons,
    byCategory: byCategoryOf(byMonthCategory.get(month)),
    yoyTons,
    yoyPercent,
  }));
}

export function getSeasonProductionByCategory(db: Database.Database): SeasonProductionByCategoryRow[] {
  const entries = getRawEntriesWithSub(db);
  const bySeason = new Map<string, number>();
  const bySeasonCategory = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const season = seasonKey(e.date);
    const tons = tonsOf(e);
    bySeason.set(season, (bySeason.get(season) ?? 0) + tons);
    const category = classifyCategoryWithTonbag(e.category, e.sub);
    if (category) {
      const catMap = bySeasonCategory.get(season) ?? new Map<string, number>();
      catMap.set(category, (catMap.get(category) ?? 0) + tons);
      bySeasonCategory.set(season, catMap);
    }
  }
  const seasons = [...bySeason.keys()].sort();
  return withYoy(seasons, bySeason, prevSeasonKey, (season, tons, yoyTons, yoyPercent) => ({
    season,
    tons,
    byCategory: byCategoryOf(bySeasonCategory.get(season)),
    yoyTons,
    yoyPercent,
  }));
}
