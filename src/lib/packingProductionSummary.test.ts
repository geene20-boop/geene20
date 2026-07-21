import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getMonthlyProduction, getSeasonProduction } from "@/lib/packingProductionSummary";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE packing_item (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
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
