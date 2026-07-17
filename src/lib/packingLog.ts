import * as XLSX from "xlsx";

export interface PackingLogRow {
  id: string;
  date: string; // YYYY-MM-DD
  type: string; // 'pack' | 'ship' | ...
  productKey: string;
  qty: number;
  unit: string; // '톤' | '포' | ...
}

export interface PackingLogSummary {
  date: string;
  tonQty: number; // pack 타입 중 '톤' 단위 합계 (일일포장량과 바로 비교 가능)
  bagPackQty: number; // pack 타입 중 '포' 단위 합계 (톤 환산 불가, 참고용)
  bagPackCount: number;
  rows: PackingLogRow[];
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function dateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return str(v).slice(0, 10);
}

export function parsePackingLogCsv(csvText: string): PackingLogRow[] {
  const wb = XLSX.read(csvText, { type: "string", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const header = (rows[0] ?? []).map((h) => str(h).toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());

  const idCol = col("id");
  const dateCol = col("date");
  const typeCol = col("type");
  const productCol = col("productKey");
  const qtyCol = col("qty");
  const unitCol = col("unit");

  const result: PackingLogRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const dateRaw = dateStr(row[dateCol]);
    if (!dateRaw) continue;
    const qty = num(row[qtyCol]);
    if (qty == null) continue;

    result.push({
      id: str(row[idCol]),
      date: dateRaw,
      type: str(row[typeCol]),
      productKey: str(row[productCol]),
      qty,
      unit: str(row[unitCol]),
    });
  }
  return result;
}

export function summarizePackingLog(rows: PackingLogRow[], date: string): PackingLogSummary {
  const dayRows = rows.filter((r) => r.date === date && r.type === "pack");
  const tonRows = dayRows.filter((r) => r.unit === "톤");
  const bagRows = dayRows.filter((r) => r.unit !== "톤");

  return {
    date,
    tonQty: tonRows.reduce((s, r) => s + r.qty, 0),
    bagPackQty: bagRows.reduce((s, r) => s + r.qty, 0),
    bagPackCount: bagRows.length,
    rows: dayRows,
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 - 같은 시트를 반복 요청하지 않도록 짧게 캐싱

declare global {
  var __packingLogCache: Map<string, { text: string; fetchedAt: number }> | undefined;
}

function cache(): Map<string, { text: string; fetchedAt: number }> {
  if (!global.__packingLogCache) global.__packingLogCache = new Map();
  return global.__packingLogCache;
}

export async function fetchPackingLogCsv(url: string): Promise<string> {
  const cached = cache().get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`포장일지 시트를 가져오지 못했습니다 (HTTP ${res.status})`);
  const text = await res.text();
  cache().set(url, { text, fetchedAt: Date.now() });
  return text;
}
