import Database from "better-sqlite3";

export interface DailyInboundRow {
  date: string; // "YYYY-MM-DD"
  qty: number;
  dodQty: number | null; // 전일 대비 증감
  dodPercent: number | null;
}

export interface MonthlyInboundRow {
  month: string; // "YYYY-MM"
  qty: number;
  yoyQty: number | null; // 전년 동월 대비 증감
  yoyPercent: number | null;
}

export interface SeasonInboundRow {
  season: string; // "2025-2026" (2025년 7월 ~ 2026년 6월)
  qty: number;
  yoyQty: number | null; // 전 시즌(전년) 대비 증감
  yoyPercent: number | null;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// 7월~다음해 6월을 한 시즌(1년)으로 본다. 시즌 키는 시작연도 기준.
export function seasonKey(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function prevYearSameMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, m - 1 - 12, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevSeasonKey(season: string): string {
  const startYear = Number(season.slice(0, 4));
  return `${startYear - 1}-${startYear}`;
}

function shiftSeasonKey(season: string, delta: number): string {
  const startYear = Number(season.slice(0, 4)) + delta;
  return `${startYear}-${startYear + 1}`;
}

function shiftDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface RawEntry {
  date: string;
  qty: number;
}

function getRawEntries(db: Database.Database, materialKey?: string | null): RawEntry[] {
  if (materialKey) {
    return db
      .prepare("SELECT date, qty FROM raw_material_inbound WHERE material_key = ?")
      .all(materialKey) as RawEntry[];
  }
  return db.prepare("SELECT date, qty FROM raw_material_inbound").all() as RawEntry[];
}

// 기준일(anchorDate)로부터 최근 windowDays일 구간의 일별 입고량과 전일대비 증감을 계산한다.
export function getDailyInbound(
  db: Database.Database,
  anchorDate: string,
  windowDays: number,
  materialKey?: string | null
): DailyInboundRow[] {
  const entries = getRawEntries(db, materialKey);
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.qty);
  }
  const from = shiftDateStr(anchorDate, -(windowDays - 1));
  const dates: string[] = [];
  for (let i = 0; i < windowDays; i++) dates.push(shiftDateStr(from, i));
  return dates.map((date) => {
    const qty = byDate.get(date) ?? 0;
    const prevQty = byDate.get(shiftDateStr(date, -1)) ?? null;
    const dodQty = prevQty != null ? qty - prevQty : null;
    const dodPercent = prevQty != null && prevQty !== 0 ? ((dodQty as number) / prevQty) * 100 : null;
    return { date, qty, dodQty, dodPercent };
  });
}

// 기준월(anchorMonth)로부터 최근 windowMonths개월 구간의 월별 입고량과 전년동월대비 증감을 계산한다.
export function getMonthlyInbound(
  db: Database.Database,
  anchorMonth: string,
  windowMonths: number,
  materialKey?: string | null
): MonthlyInboundRow[] {
  const entries = getRawEntries(db, materialKey);
  const byMonth = new Map<string, number>();
  for (const e of entries) {
    const month = monthKey(e.date);
    byMonth.set(month, (byMonth.get(month) ?? 0) + e.qty);
  }
  const months: string[] = [];
  for (let i = windowMonths - 1; i >= 0; i--) months.push(shiftMonthKey(anchorMonth, -i));
  return months.map((month) => {
    const qty = byMonth.get(month) ?? 0;
    const prevQty = byMonth.get(prevYearSameMonthKey(month)) ?? null;
    const yoyQty = prevQty != null ? qty - prevQty : null;
    const yoyPercent = prevQty != null && prevQty !== 0 ? ((yoyQty as number) / prevQty) * 100 : null;
    return { month, qty, yoyQty, yoyPercent };
  });
}

// 기준 시즌(anchorSeason)으로부터 최근 windowSeasons개 시즌 구간의 시즌별 입고량과 전년대비 증감을 계산한다.
export function getSeasonInbound(
  db: Database.Database,
  anchorSeason: string,
  windowSeasons: number,
  materialKey?: string | null
): SeasonInboundRow[] {
  const entries = getRawEntries(db, materialKey);
  const bySeason = new Map<string, number>();
  for (const e of entries) {
    const season = seasonKey(e.date);
    bySeason.set(season, (bySeason.get(season) ?? 0) + e.qty);
  }
  const seasons: string[] = [];
  for (let i = windowSeasons - 1; i >= 0; i--) seasons.push(shiftSeasonKey(anchorSeason, -i));
  return seasons.map((season) => {
    const qty = bySeason.get(season) ?? 0;
    const prevQty = bySeason.get(prevSeasonKey(season)) ?? null;
    const yoyQty = prevQty != null ? qty - prevQty : null;
    const yoyPercent = prevQty != null && prevQty !== 0 ? ((yoyQty as number) / prevQty) * 100 : null;
    return { season, qty, yoyQty, yoyPercent };
  });
}
