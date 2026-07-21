import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { adjustStock, applyPackEffect } from "@/lib/packingStock";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE packing_item (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      category TEXT,
      sub TEXT,
      unit TEXT,
      bag_kg REAL,
      bag_mat_key TEXT,
      stock REAL NOT NULL DEFAULT 0,
      cumulative_produced REAL NOT NULL DEFAULT 0
    );
  `);
  const insert = db.prepare(
    "INSERT INTO packing_item (key, kind, stock) VALUES (?, ?, ?)"
  );
  insert.run("product_a", "product", 0);
  insert.run("bagmat_a", "bagmat", 100);
  insert.run("topsheet_a", "aux", 50);
  insert.run("wrap_a", "aux", 50);
  insert.run("aux_a", "aux", 20);
  return db;
}

function stockOf(db: Database.Database, key: string): number {
  return (db.prepare("SELECT stock FROM packing_item WHERE key = ?").get(key) as { stock: number })
    .stock;
}

function cumulativeProducedOf(db: Database.Database, key: string): number {
  return (
    db.prepare("SELECT cumulative_produced FROM packing_item WHERE key = ?").get(key) as {
      cumulative_produced: number;
    }
  ).cumulative_produced;
}

describe("adjustStock", () => {
  it("increases stock by a positive delta", () => {
    const db = makeDb();
    adjustStock(db, "product_a", 10);
    expect(stockOf(db, "product_a")).toBe(10);
  });

  it("decreases stock by a negative delta", () => {
    const db = makeDb();
    adjustStock(db, "bagmat_a", -30);
    expect(stockOf(db, "bagmat_a")).toBe(70);
  });

  it("throws for an unknown item key", () => {
    const db = makeDb();
    expect(() => adjustStock(db, "does_not_exist", 5)).toThrow();
  });

  it("is a no-op for a zero delta", () => {
    const db = makeDb();
    adjustStock(db, "product_a", 0);
    expect(stockOf(db, "product_a")).toBe(0);
  });
});

describe("applyPackEffect", () => {
  it("increases the product and decreases bagmat/topsheet/wrap/aux on pack (sign=1)", () => {
    const db = makeDb();
    applyPackEffect(
      db,
      {
        productKey: "product_a",
        qty: 10,
        bagMatKey: "bagmat_a",
        bagMatQty: 10,
        topsheetKey: "topsheet_a",
        topsheetQty: 2,
        wrapKey: "wrap_a",
        wrapQty: 1,
        auxUseKey: "aux_a",
        auxUseQty: 1,
      },
      1
    );
    expect(stockOf(db, "product_a")).toBe(10);
    expect(stockOf(db, "bagmat_a")).toBe(90);
    expect(stockOf(db, "topsheet_a")).toBe(48);
    expect(stockOf(db, "wrap_a")).toBe(49);
    expect(stockOf(db, "aux_a")).toBe(19);
  });

  it("exactly reverses the effect when sign=-1 is applied after sign=1 (edit/delete reversal)", () => {
    const db = makeDb();
    const entry = {
      productKey: "product_a",
      qty: 10,
      bagMatKey: "bagmat_a",
      bagMatQty: 10,
      topsheetKey: "topsheet_a",
      topsheetQty: 2,
      wrapKey: "wrap_a",
      wrapQty: 1,
      auxUseKey: "aux_a",
      auxUseQty: 1,
    };
    applyPackEffect(db, entry, 1);
    applyPackEffect(db, entry, -1);
    expect(stockOf(db, "product_a")).toBe(0);
    expect(stockOf(db, "bagmat_a")).toBe(100);
    expect(stockOf(db, "topsheet_a")).toBe(50);
    expect(stockOf(db, "wrap_a")).toBe(50);
    expect(stockOf(db, "aux_a")).toBe(20);
  });

  it("skips optional consumption fields that are not provided", () => {
    const db = makeDb();
    applyPackEffect(db, { productKey: "product_a", qty: 5 }, 1);
    expect(stockOf(db, "product_a")).toBe(5);
    expect(stockOf(db, "bagmat_a")).toBe(100);
  });

  it("increases cumulative_produced only when isProduction is true (pack), not for ship", () => {
    const db = makeDb();
    applyPackEffect(db, { productKey: "product_a", qty: 10, isProduction: true }, 1);
    expect(cumulativeProducedOf(db, "product_a")).toBe(10);

    // 출하(ship)는 재고만 줄고 생산누계에는 영향 없어야 함
    applyPackEffect(db, { productKey: "product_a", qty: -4 }, 1);
    expect(stockOf(db, "product_a")).toBe(6);
    expect(cumulativeProducedOf(db, "product_a")).toBe(10);
  });

  it("reverses cumulative_produced symmetrically on sign=-1 (edit/delete reversal)", () => {
    const db = makeDb();
    const entry = { productKey: "product_a", qty: 10, isProduction: true };
    applyPackEffect(db, entry, 1);
    applyPackEffect(db, entry, -1);
    expect(cumulativeProducedOf(db, "product_a")).toBe(0);
  });
});

describe("db.transaction atomicity (packing_entry write pattern)", () => {
  it("rolls back all stock changes if any step in the transaction throws", () => {
    const db = makeDb();
    const tx = db.transaction(() => {
      adjustStock(db, "product_a", 10);
      adjustStock(db, "unknown_item", -5); // throws, should roll back product_a too
    });
    expect(() => tx()).toThrow();
    expect(stockOf(db, "product_a")).toBe(0);
  });
});
