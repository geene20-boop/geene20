import Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { RawMaterial } from "@/lib/types";

export function getRawMaterial(db: Database.Database, key: string): RawMaterial | undefined {
  return db.prepare("SELECT * FROM raw_material WHERE key = ?").get(key) as RawMaterial | undefined;
}

/** 이력관리(감사로그) 표시용: key 대신 원재료명을 보여준다. */
export function rawMaterialAuditLabel(db: Database.Database, key: string): string {
  const item = getRawMaterial(db, key);
  return item ? `[${item.key}] ${item.name}` : key;
}

/** 원재료 재고를 delta만큼 증감. 존재하지 않는 원재료면 에러. */
export function adjustRawMaterialStock(db: Database.Database, key: string, delta: number): void {
  if (!key || !delta) return;
  const row = getRawMaterial(db, key);
  if (!row) throw new Error(`알 수 없는 원재료입니다: ${key}`);
  db.prepare("UPDATE raw_material SET stock = stock + ? WHERE key = ?").run(delta, key);
}

/**
 * 입고 단가가 원재료 마스터의 최근단가와 다르면 단가변동이력에 기록하고 마스터 단가를 갱신한다.
 * (수정/삭제로 인한 되돌림 호출에서는 기록하지 않도록 record=false로 호출)
 */
export function recordPriceChangeIfNeeded(
  db: Database.Database,
  materialKey: string,
  newPrice: number | null,
  effectiveDate: string,
  actor: string
): void {
  if (newPrice == null) return;
  const material = getRawMaterial(db, materialKey);
  if (!material) return;
  if (material.last_price === newPrice) return;
  db.prepare(
    `INSERT INTO raw_material_price_history (material_key, effective_date, old_price, new_price, changed_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(materialKey, effectiveDate, material.last_price, newPrice, actor);
  db.prepare("UPDATE raw_material SET last_price = ? WHERE key = ?").run(newPrice, materialKey);
}

export function runInTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}
