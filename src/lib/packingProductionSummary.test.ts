import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  classifyProductCategory,
  getDailyPackingSummary,
  getMonthlyProduction,
  getSeasonProduction,
} from "@/lib/packingProductionSummary";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE packing_item (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      category TEXT,
      bag_kg REAL
    );
    CREATE TABLE packing_entry (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      product_key TEXT NOT NULL,
      qty REAL NOT NULL
    );
  `);
  db.prepare("INSERT INTO packing_item (key, kind, bag_kg) VALUES (?, ?, ?)").run("prod_a", "product", 20);
  db.prepare("INSERT INTO packing_item (key, kind, bag_kg) VALUES (?, ?, ?)").run("bagmat_a", "bagmat", 0);
  return db;
}

function addEntry(
  db: Database.Database,
  id: string,
  date: string,
  type: "pack" | "ship",
  productKey: string,
  qty: number
) {
  db.prepare(
    "INSERT INTO packing_entry (id, date, type, product_key, qty) VALUES (?, ?, ?, ?, ?)"
  ).run(id, date, type, productKey, qty);
}

describe("getMonthlyProduction", () => {
  it("aggregates pack entries into tons per month using bag_kg", () => {
    const db = makeDb();
    // 20kg * 100포 = 2000kg = 2톤
    addEntry(db, "1", "2025-07-05", "pack", "prod_a", 100);
    addEntry(db, "2", "2025-07-20", "pack", "prod_a", 50); // +1톤 -> 합계 3톤
    const rows = getMonthlyProduction(db);
    expect(rows).toEqual([{ month: "2025-07", tons: 3, yoyTons: null, yoyPercent: null }]);
  });

  it("ignores ship entries and non-product kinds", () => {
    const db = makeDb();
    addEntry(db, "1", "2025-07-05", "pack", "prod_a", 100);
    addEntry(db, "2", "2025-07-05", "ship", "prod_a", 40);
    addEntry(db, "3", "2025-07-05", "pack", "bagmat_a", 999);
    const rows = getMonthlyProduction(db);
    expect(rows).toEqual([{ month: "2025-07", tons: 2, yoyTons: null, yoyPercent: null }]);
  });

  it("computes 전년동월 대비 (same calendar month, previous year)", () => {
    const db = makeDb();
    addEntry(db, "1", "2025-07-01", "pack", "prod_a", 100); // 2톤
    addEntry(db, "2", "2026-07-01", "pack", "prod_a", 150); // 3톤
    const rows = getMonthlyProduction(db);
    const july2026 = rows.find((r) => r.month === "2026-07");
    expect(july2026?.tons).toBe(3);
    expect(july2026?.yoyTons).toBe(1);
    expect(july2026?.yoyPercent).toBe(50);
  });
});

describe("getSeasonProduction", () => {
  it("groups July~June as one season keyed by the starting year", () => {
    const db = makeDb();
    addEntry(db, "1", "2025-07-01", "pack", "prod_a", 100); // 2톤, 2025-2026 시즌
    addEntry(db, "2", "2026-06-30", "pack", "prod_a", 50); // 1톤, 같은 시즌
    addEntry(db, "3", "2026-07-01", "pack", "prod_a", 100); // 2톤, 2026-2027 시즌 (새 시즌)
    const rows = getSeasonProduction(db);
    expect(rows[0]).toEqual({ season: "2025-2026", tons: 3, yoyTons: null, yoyPercent: null });
    expect(rows[1].season).toBe("2026-2027");
    expect(rows[1].tons).toBe(2);
    expect(rows[1].yoyTons).toBe(-1);
    expect(rows[1].yoyPercent).toBeCloseTo(-33.333, 2);
  });
});

describe("classifyProductCategory", () => {
  it("finds 입상규산/석회고토/칼슘유황 by substring", () => {
    expect(classifyProductCategory("입상규산")).toBe("입상규산");
    expect(classifyProductCategory("석회고토")).toBe("석회고토");
    expect(classifyProductCategory("칼슘유황")).toBe("칼슘유황");
  });

  it("returns null for unrelated categories", () => {
    expect(classifyProductCategory("톤백")).toBeNull();
    expect(classifyProductCategory("생생비타")).toBeNull();
  });
});

describe("getDailyPackingSummary", () => {
  function makeCategoryDb(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE packing_item (
        key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        category TEXT,
        bag_kg REAL
      );
      CREATE TABLE packing_entry (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        product_key TEXT NOT NULL,
        qty REAL NOT NULL
      );
    `);
    const insertItem = db.prepare(
      "INSERT INTO packing_item (key, kind, category, bag_kg) VALUES (?, ?, ?, ?)"
    );
    insertItem.run("gyusan_a", "product", "입상규산", 20);
    insertItem.run("sekhoego_a", "product", "석회고토", 20);
    insertItem.run("tonbag_a", "product", "톤백", 1000);
    return db;
  }

  function addEntry(db: Database.Database, id: string, date: string, productKey: string, qty: number) {
    db.prepare(
      "INSERT INTO packing_entry (id, date, type, product_key, qty) VALUES (?, ?, 'pack', ?, ?)"
    ).run(id, date, productKey, qty);
  }

  it("sums tons across all packed products regardless of classification", () => {
    const db = makeCategoryDb();
    addEntry(db, "1", "2026-07-01", "gyusan_a", 100); // 2톤
    addEntry(db, "2", "2026-07-01", "tonbag_a", 1); // 1톤 (분류 안 됨)
    const summary = getDailyPackingSummary(db, "2026-07-01");
    expect(summary.totalTons).toBe(3);
  });

  it("suggests the category with the most tons packed that day", () => {
    const db = makeCategoryDb();
    addEntry(db, "1", "2026-07-01", "gyusan_a", 100); // 2톤
    addEntry(db, "2", "2026-07-01", "sekhoego_a", 250); // 5톤
    const summary = getDailyPackingSummary(db, "2026-07-01");
    expect(summary.suggestedProduct).toBe("석회고토");
  });

  it("returns zero/null when no packing entries exist for the date", () => {
    const db = makeCategoryDb();
    const summary = getDailyPackingSummary(db, "2026-07-01");
    expect(summary).toEqual({ totalTons: 0, suggestedProduct: null });
  });
});
