import Database from "better-sqlite3";

// 홈화면 "전일현황" 카드용 집계 로직. packingProductionSummary/packingShipmentSummary와
// 분류 기준(대분류 3종 + 톤백 귀속)은 동일하지만, 날짜 하나를 기준으로 한 스냅샷을 만든다는 점이 다르다.

export const HOME_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"] as const;
export type HomeCategory = (typeof HOME_CATEGORIES)[number];

function classifyCategory(category: string | null, sub: string | null): HomeCategory | null {
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

function seasonKey(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export interface CategoryTons {
  category: HomeCategory;
  tons: number;
}

export interface DailyFlowSummary {
  total: number;
  byCategory: CategoryTons[];
}

function dailyFlow(db: Database.Database, date: string, type: "pack" | "ship"): DailyFlowSummary {
  const rows = db
    .prepare(
      `SELECT pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category, pi.sub as sub
       FROM packing_entry pe JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.type = ? AND pi.kind = 'product' AND pe.date = ?`
    )
    .all(type, date) as { qty: number; bag_kg: number | null; category: string | null; sub: string | null }[];

  let total = 0;
  const byCat = new Map<HomeCategory, number>();
  for (const r of rows) {
    const tons = (r.qty * (r.bag_kg ?? 0)) / 1000;
    total += tons;
    const cat = classifyCategory(r.category, r.sub);
    if (cat) byCat.set(cat, (byCat.get(cat) ?? 0) + tons);
  }
  return {
    total,
    byCategory: HOME_CATEGORIES.map((category) => ({ category, tons: byCat.get(category) ?? 0 })),
  };
}

export function getDailyProductionSummary(db: Database.Database, date: string): DailyFlowSummary {
  return dailyFlow(db, date, "pack");
}

export function getDailyShipmentSummary(db: Database.Database, date: string): DailyFlowSummary {
  return dailyFlow(db, date, "ship");
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
    if (r.category === "톤백") entry.tonbag += tons;
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

// date 마감 시점(그날 종료 후) 재고 = 현재 실재고 - (그 날짜 다음날부터 지금까지의 누적 순증감)
function productNetEffectAfter(db: Database.Database, date: string): Map<string, number> {
  const map = new Map<string, number>();
  const add = (rows: { k: string; total: number | null }[]) => {
    for (const r of rows) {
      if (r.k == null) continue;
      map.set(r.k, (map.get(r.k) ?? 0) + (r.total ?? 0));
    }
  };
  add(
    db
      .prepare(
        `SELECT product_key as k, SUM(CASE WHEN type='pack' THEN qty WHEN type='ship' THEN -qty ELSE 0 END) as total
         FROM packing_entry WHERE date > ? GROUP BY product_key`
      )
      .all(date) as { k: string; total: number | null }[]
  );
  add(
    db.prepare(`SELECT key as k, SUM(qty) as total FROM packing_restock WHERE date > ? GROUP BY key`).all(date) as {
      k: string;
      total: number | null;
    }[]
  );
  add(
    db.prepare(`SELECT key as k, SUM(-qty) as total FROM packing_breakage WHERE date > ? GROUP BY key`).all(date) as {
      k: string;
      total: number | null;
    }[]
  );
  add(
    db.prepare(`SELECT key as k, SUM(qty) as total FROM packing_return WHERE date > ? GROUP BY key`).all(date) as {
      k: string;
      total: number | null;
    }[]
  );
  add(
    db.prepare(`SELECT key as k, SUM(qty) as total FROM packing_adjustment WHERE date > ? GROUP BY key`).all(date) as {
      k: string;
      total: number | null;
    }[]
  );
  return map;
}

export interface StockSnapshot {
  byCategory: CategoryBagTonbag[];
  grandTotal: number;
}

// date 하루가 끝난 시점(마감) 기준 제품 재고 스냅샷 — "전일 재고현황"에서 쓴다.
export function getStockSnapshot(db: Database.Database, date: string): StockSnapshot {
  const items = db
    .prepare("SELECT key, category, sub, bag_kg, stock FROM packing_item WHERE kind = 'product'")
    .all() as { key: string; category: string | null; sub: string | null; bag_kg: number | null; stock: number }[];

  const netAfter = productNetEffectAfter(db, date);
  const byCat = new Map<HomeCategory, { bag: number; tonbag: number }>();
  let grandTotal = 0;
  for (const item of items) {
    const cat = classifyCategory(item.category, item.sub);
    if (!cat) continue;
    const closingStock = item.stock - (netAfter.get(item.key) ?? 0);
    const tons = (closingStock * (item.bag_kg ?? 0)) / 1000;
    grandTotal += tons;
    const entry = byCat.get(cat) ?? { bag: 0, tonbag: 0 };
    if (item.category === "톤백") entry.tonbag += tons;
    else entry.bag += tons;
    byCat.set(cat, entry);
  }
  return {
    byCategory: HOME_CATEGORIES.map((category) => ({ category, ...(byCat.get(category) ?? { bag: 0, tonbag: 0 }) })),
    grandTotal,
  };
}
