import Database from "better-sqlite3";
import { stripCode } from "@/lib/packingClient";

// 홈화면 "전일현황"의 시즌누계(7월~다음해 6월) 집계. packingProductionSummary/packingShipmentSummary와
// 분류 기준(대분류 3종 + 톤백 귀속)은 동일하지만, 포장지 제품/톤백 제품을 나눠서 반환한다는 점이 다르다.

export const HOME_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"] as const;
export type HomeCategory = (typeof HOME_CATEGORIES)[number];

function classifyCategory(category: string | null, sub: string | null): HomeCategory | null {
  const cat = category ?? "";
  if (cat.includes("입상규산")) return "입상규산";
  if (cat.includes("석회고토")) return "석회고토";
  if (cat.includes("칼슘") || cat.includes("유황")) return "칼슘유황";
  if (stripCode(cat) === "톤백") {
    const s = sub ?? "";
    if (s.includes("석회고토")) return "석회고토";
    if (s.includes("규산")) return "입상규산";
    if (s.includes("칼슘") || s.includes("유황")) return "칼슘유황";
  }
  return null;
}

function seasonKey(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export interface CategoryBagTonbag {
  category: HomeCategory;
  bag: number;
  tonbag: number;
}

// 기준일이 속한 시즌(7월~다음해 6월) 전체 누계를 포장지 제품/톤백 제품으로 나눠서 계산한다.
function seasonBagTonbag(db: Database.Database, referenceDate: string, type: "pack" | "ship"): CategoryBagTonbag[] {
  const rows = db
    .prepare(
      `SELECT pe.date as date, pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category, pi.sub as sub
       FROM packing_entry pe JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = ? AND pi.kind = 'product'`
    )
    .all(type) as { date: string; qty: number; bag_kg: number | null; category: string | null; sub: string | null }[];

  const targetSeason = seasonKey(referenceDate);
  const byCat = new Map<HomeCategory, { bag: number; tonbag: number }>();
  for (const r of rows) {
    if (seasonKey(r.date) !== targetSeason) continue;
    const cat = classifyCategory(r.category, r.sub);
    if (!cat) continue;
    const tons = (r.qty * (r.bag_kg ?? 0)) / 1000;
    const entry = byCat.get(cat) ?? { bag: 0, tonbag: 0 };
    if (stripCode(r.category) === "톤백") entry.tonbag += tons;
    else entry.bag += tons;
    byCat.set(cat, entry);
  }
  return HOME_CATEGORIES.map((category) => ({ category, ...(byCat.get(category) ?? { bag: 0, tonbag: 0 }) }));
}

export function getSeasonProductionBagTonbag(db: Database.Database, referenceDate: string): CategoryBagTonbag[] {
  return seasonBagTonbag(db, referenceDate, "pack");
}

export function getSeasonShipmentBagTonbag(db: Database.Database, referenceDate: string): CategoryBagTonbag[] {
  return seasonBagTonbag(db, referenceDate, "ship");
}
