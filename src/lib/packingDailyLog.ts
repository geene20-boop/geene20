import Database from "better-sqlite3";
import { PackingItem } from "@/lib/types";

export interface DailyLogRow {
  key: string;
  label: string;
  unit: string | null;
  prevStock: number; // 전일재고 (그 날짜 시작 시점 재고)
  packedQty: number; // 금일포장(생산)
  shippedQty: number; // 출고량
  usedQty: number; // 금일사용 (생산에 소모된 포장지/부자재)
  restockedQty: number; // 금일입고
  returnedQty: number; // 금일반품
  breakageQty: number; // 파포수량
  currentStock: number; // 현재재고 (그 날짜 마감 시점 재고)
}

export interface DailyLogResult {
  products: DailyLogRow[];
  bagmats: DailyLogRow[];
  auxes: DailyLogRow[];
  breakages: { key: string; label: string; qty: number; worker: string | null }[];
  returns: { key: string; label: string; qty: number; worker: string | null }[];
}

function label(item: PackingItem): string {
  return [item.category, item.sub].filter(Boolean).join(" ") || item.key;
}

function sumByKey(
  db: Database.Database,
  sql: string,
  params: unknown[]
): Map<string, number> {
  const rows = db.prepare(sql).all(...params) as { k: string | null; total: number | null }[];
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.k == null) continue;
    map.set(r.k, (map.get(r.k) ?? 0) + (r.total ?? 0));
  }
  return map;
}

// 여러 Map을 하나로 합친다 (없는 키는 0으로 취급)
function mergeMaps(...maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) {
    for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v);
  }
  return out;
}

// date 조건(>= 이면 미래 누적, = 이면 그날 하루)에 대해 품목별 순증감(net effect)을 계산한다.
// packingStock.ts의 실제 재고 반영 로직(applyPackEffect 등)과 동일한 부호를 사용해야 한다.
function netEffectByKey(db: Database.Database, op: ">=" | "=", date: string): Map<string, number> {
  const productNet = sumByKey(
    db,
    `SELECT product_key as k, SUM(CASE WHEN type='pack' THEN qty WHEN type='ship' THEN -qty ELSE 0 END) as total
     FROM packing_entry WHERE date ${op} ? GROUP BY product_key`,
    [date]
  );
  const bagMatNet = sumByKey(
    db,
    `SELECT bag_mat_key as k, SUM(-bag_mat_qty) as total FROM packing_entry
     WHERE date ${op} ? AND bag_mat_key IS NOT NULL GROUP BY bag_mat_key`,
    [date]
  );
  const topsheetNet = sumByKey(
    db,
    `SELECT topsheet_key as k, SUM(-topsheet_qty) as total FROM packing_entry
     WHERE date ${op} ? AND topsheet_key IS NOT NULL GROUP BY topsheet_key`,
    [date]
  );
  const wrapNet = sumByKey(
    db,
    `SELECT wrap_key as k, SUM(-wrap_qty) as total FROM packing_entry
     WHERE date ${op} ? AND wrap_key IS NOT NULL GROUP BY wrap_key`,
    [date]
  );
  const auxNet = sumByKey(
    db,
    `SELECT aux_use_key as k, SUM(-aux_use_qty) as total FROM packing_entry
     WHERE date ${op} ? AND aux_use_key IS NOT NULL GROUP BY aux_use_key`,
    [date]
  );
  const restockNet = sumByKey(
    db,
    `SELECT key as k, SUM(qty) as total FROM packing_restock WHERE date ${op} ? GROUP BY key`,
    [date]
  );
  const breakageNet = sumByKey(
    db,
    `SELECT key as k, SUM(-qty) as total FROM packing_breakage WHERE date ${op} ? GROUP BY key`,
    [date]
  );
  const returnNet = sumByKey(
    db,
    `SELECT key as k, SUM(qty) as total FROM packing_return WHERE date ${op} ? GROUP BY key`,
    [date]
  );
  const adjustmentNet = sumByKey(
    db,
    `SELECT key as k, SUM(qty) as total FROM packing_adjustment WHERE date ${op} ? GROUP BY key`,
    [date]
  );
  return mergeMaps(
    productNet,
    bagMatNet,
    topsheetNet,
    wrapNet,
    auxNet,
    restockNet,
    breakageNet,
    returnNet,
    adjustmentNet
  );
}

export function getDailyLog(db: Database.Database, date: string): DailyLogResult {
  const items = db.prepare("SELECT * FROM packing_item ORDER BY kind, category, sub").all() as PackingItem[];

  // 전일재고 = 현재 실재고 - (그 날짜 이후 지금까지의 누적 순증감)
  const netSinceThatDay = netEffectByKey(db, ">=", date);
  // 그날 하루의 순증감(품목별 분해 표시용 + 현재재고 계산용)
  const netToday = netEffectByKey(db, "=", date);

  const packedByProduct = sumByKey(
    db,
    "SELECT product_key as k, SUM(qty) as total FROM packing_entry WHERE date = ? AND type = 'pack' GROUP BY product_key",
    [date]
  );
  const shippedByProduct = sumByKey(
    db,
    "SELECT product_key as k, SUM(qty) as total FROM packing_entry WHERE date = ? AND type = 'ship' GROUP BY product_key",
    [date]
  );
  const usedBagMat = sumByKey(
    db,
    "SELECT bag_mat_key as k, SUM(bag_mat_qty) as total FROM packing_entry WHERE date = ? AND bag_mat_key IS NOT NULL GROUP BY bag_mat_key",
    [date]
  );
  const usedTopsheet = sumByKey(
    db,
    "SELECT topsheet_key as k, SUM(topsheet_qty) as total FROM packing_entry WHERE date = ? AND topsheet_key IS NOT NULL GROUP BY topsheet_key",
    [date]
  );
  const usedWrap = sumByKey(
    db,
    "SELECT wrap_key as k, SUM(wrap_qty) as total FROM packing_entry WHERE date = ? AND wrap_key IS NOT NULL GROUP BY wrap_key",
    [date]
  );
  const usedAux = sumByKey(
    db,
    "SELECT aux_use_key as k, SUM(aux_use_qty) as total FROM packing_entry WHERE date = ? AND aux_use_key IS NOT NULL GROUP BY aux_use_key",
    [date]
  );
  const usedTotal = mergeMaps(usedBagMat, usedTopsheet, usedWrap, usedAux);
  const restockedByKey = sumByKey(
    db,
    "SELECT key as k, SUM(qty) as total FROM packing_restock WHERE date = ? GROUP BY key",
    [date]
  );
  const returnedByKey = sumByKey(
    db,
    "SELECT key as k, SUM(qty) as total FROM packing_return WHERE date = ? GROUP BY key",
    [date]
  );
  const breakageByKey = sumByKey(
    db,
    "SELECT key as k, SUM(qty) as total FROM packing_breakage WHERE date = ? GROUP BY key",
    [date]
  );

  function buildRow(item: PackingItem): DailyLogRow {
    const prevStock = item.stock - (netSinceThatDay.get(item.key) ?? 0);
    const currentStock = prevStock + (netToday.get(item.key) ?? 0);
    return {
      key: item.key,
      label: label(item),
      unit: item.unit,
      prevStock,
      packedQty: packedByProduct.get(item.key) ?? 0,
      shippedQty: shippedByProduct.get(item.key) ?? 0,
      usedQty: usedTotal.get(item.key) ?? 0,
      restockedQty: restockedByKey.get(item.key) ?? 0,
      returnedQty: returnedByKey.get(item.key) ?? 0,
      breakageQty: breakageByKey.get(item.key) ?? 0,
      currentStock,
    };
  }

  const products = items.filter((i) => i.kind === "product").map(buildRow);
  const bagmats = items.filter((i) => i.kind === "bagmat").map(buildRow);
  const auxes = items.filter((i) => i.kind === "aux").map(buildRow);

  const itemByKey = new Map(items.map((i) => [i.key, i]));
  const breakageRows = db
    .prepare("SELECT key, qty, worker FROM packing_breakage WHERE date = ? ORDER BY created_at")
    .all(date) as { key: string; qty: number; worker: string | null }[];
  const returnRows = db
    .prepare("SELECT key, qty, worker FROM packing_return WHERE date = ? ORDER BY created_at")
    .all(date) as { key: string; qty: number; worker: string | null }[];

  return {
    products,
    bagmats,
    auxes,
    breakages: breakageRows.map((r) => ({
      key: r.key,
      label: itemByKey.has(r.key) ? label(itemByKey.get(r.key) as PackingItem) : r.key,
      qty: r.qty,
      worker: r.worker,
    })),
    returns: returnRows.map((r) => ({
      key: r.key,
      label: itemByKey.has(r.key) ? label(itemByKey.get(r.key) as PackingItem) : r.key,
      qty: r.qty,
      worker: r.worker,
    })),
  };
}
