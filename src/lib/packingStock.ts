import Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { PackingItem } from "@/lib/types";

export interface PackEffectInput {
  productKey: string;
  qty: number;
  bagMatKey?: string | null;
  bagMatQty?: number | null;
  topsheetKey?: string | null;
  topsheetQty?: number | null;
  wrapKey?: string | null;
  wrapQty?: number | null;
  auxUseKey?: string | null;
  auxUseQty?: number | null;
}

export function getPackingItem(db: Database.Database, key: string): PackingItem | undefined {
  return db.prepare("SELECT * FROM packing_item WHERE key = ?").get(key) as PackingItem | undefined;
}

/** 품목 재고를 delta만큼 증감. 존재하지 않는 품목이면 에러. */
export function adjustStock(db: Database.Database, key: string, delta: number): void {
  if (!key || !delta) return;
  const row = getPackingItem(db, key);
  if (!row) throw new Error(`알 수 없는 품목입니다: ${key}`);
  db.prepare("UPDATE packing_item SET stock = stock + ? WHERE key = ?").run(delta, key);
}

/** 생산(포장) 입력의 재고 효과: 제품 +qty, 포장지/랩/부자재 -qty. sign=-1이면 반대로(취소용). */
export function applyPackEffect(db: Database.Database, entry: PackEffectInput, sign: 1 | -1): void {
  adjustStock(db, entry.productKey, sign * entry.qty);
  if (entry.bagMatKey && entry.bagMatQty) adjustStock(db, entry.bagMatKey, -sign * entry.bagMatQty);
  if (entry.topsheetKey && entry.topsheetQty) adjustStock(db, entry.topsheetKey, -sign * entry.topsheetQty);
  if (entry.wrapKey && entry.wrapQty) adjustStock(db, entry.wrapKey, -sign * entry.wrapQty);
  if (entry.auxUseKey && entry.auxUseQty) adjustStock(db, entry.auxUseKey, -sign * entry.auxUseQty);
}

/** getDb()로 얻은 DB에 대해 주어진 함수를 트랜잭션으로 실행 (원자성 보장) */
export function runInTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}
