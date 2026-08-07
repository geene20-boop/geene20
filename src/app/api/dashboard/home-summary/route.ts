import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Nationality, ShiftType } from "@/lib/types";

const DISPLAY_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function classifyCategory(category: string | null, sub: string | null): string | null {
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

export async function GET() {
  const db = getDb();
  const yesterday = shiftDate(today(), -1);

  // 전일 생산량/출하량(톤) — 제품포장 생산/출하 입력 기준
  const entries = db
    .prepare(
      `SELECT pe.type as type, pe.qty as qty, pi.bag_kg as bag_kg
       FROM packing_entry pe JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.date = ? AND pi.kind = 'product'`
    )
    .all(yesterday) as { type: string; qty: number; bag_kg: number | null }[];
  let productionTons = 0;
  let shipmentTons = 0;
  for (const e of entries) {
    const tons = (e.qty * (e.bag_kg ?? 0)) / 1000;
    if (e.type === "pack") productionTons += tons;
    else if (e.type === "ship") shipmentTons += tons;
  }

  // 전일 원재료 입고
  const inboundRows = db
    .prepare(
      `SELECT ri.qty as qty, ri.judgment as judgment, rm.name as name, rm.form as form
       FROM raw_material_inbound ri JOIN raw_material rm ON ri.material_key = rm.key
       WHERE ri.date = ?`
    )
    .all(yesterday) as { qty: number; judgment: string; name: string; form: string }[];
  const inboundTotal = inboundRows.reduce((s, r) => s + r.qty, 0);
  const inboundByMaterial = new Map<string, number>();
  for (const r of inboundRows) inboundByMaterial.set(r.name, (inboundByMaterial.get(r.name) ?? 0) + r.qty);
  const inboundTop = [...inboundByMaterial.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));
  const inboundNgCount = inboundRows.filter((r) => r.judgment === "NG").length;

  // 현재 제품 재고 (품목대분류별, 톤)
  const stockItems = db
    .prepare(`SELECT category, sub, bag_kg, stock FROM packing_item WHERE kind = 'product'`)
    .all() as { category: string | null; sub: string | null; bag_kg: number | null; stock: number }[];
  const stockByCategory = new Map<string, { bags: number; tons: number }>();
  let stockTotalTons = 0;
  for (const it of stockItems) {
    const category = classifyCategory(it.category, it.sub);
    if (!category) continue;
    const tons = (it.stock * (it.bag_kg ?? 0)) / 1000;
    const entry = stockByCategory.get(category) ?? { bags: 0, tons: 0 };
    entry.bags += it.stock;
    entry.tons += tons;
    stockByCategory.set(category, entry);
    stockTotalTons += tons;
  }
  const stockRows = DISPLAY_CATEGORIES.map((category) => ({
    category,
    bags: Math.round(stockByCategory.get(category)?.bags ?? 0),
    tons: Number((stockByCategory.get(category)?.tons ?? 0).toFixed(1)),
  }));

  // 전일 근태현황 (주간/야간별)
  const workers = db
    .prepare("SELECT id, nationality, shift_type FROM worker WHERE active = 1")
    .all() as { id: number; nationality: Nationality; shift_type: ShiftType | null }[];
  const dailyRows = db
    .prepare("SELECT worker_id, shift, status FROM daily_attendance WHERE date = ?")
    .all(yesterday) as { worker_id: number; shift: ShiftType | null; status: string | null }[];
  const dailyByWorker = new Map(dailyRows.map((r) => [r.worker_id, r]));
  const leaveRows = db
    .prepare(
      `SELECT worker_id FROM leave_request WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
    )
    .all(yesterday, yesterday) as { worker_id: number }[];
  const onLeave = new Set(leaveRows.map((r) => r.worker_id));

  const attendance = {
    day: { normal: 0, leave: 0, other: 0, total: 0 },
    night: { normal: 0, leave: 0, other: 0, total: 0 },
  };
  for (const w of workers) {
    const daily = dailyByWorker.get(w.id);
    const shift = (daily?.shift ?? w.shift_type ?? "day") as ShiftType;
    const bucket = attendance[shift];
    bucket.total += 1;
    if (onLeave.has(w.id)) bucket.leave += 1;
    else if (daily?.status) bucket.other += 1;
    else bucket.normal += 1;
  }

  // 알림: 원재료 입고검수 NG, 생산일지 미확정(전일)
  const notices: { text: string; level: "red" | "amber" }[] = [];
  if (inboundNgCount > 0) {
    notices.push({ text: `전일 원재료 입고검수 NG ${inboundNgCount}건`, level: "red" });
  }
  const prodLocks = db
    .prepare("SELECT shift, locked FROM production_log WHERE date = ?")
    .all(yesterday) as { shift: string; locked: number }[];
  const lockedByShift = new Map(prodLocks.map((r) => [r.shift, r.locked]));
  for (const shift of ["주", "야"]) {
    if (!lockedByShift.get(shift)) {
      notices.push({ text: `전일 ${shift}조 생산일지 미확정`, level: "amber" });
    }
  }

  return NextResponse.json({
    date: yesterday,
    production: { tons: Number(productionTons.toFixed(1)) },
    shipment: { tons: Number(shipmentTons.toFixed(1)) },
    inbound: { tons: Number(inboundTotal.toFixed(1)), top: inboundTop },
    stock: { byCategory: stockRows, totalTons: Number(stockTotalTons.toFixed(1)) },
    attendance,
    notices,
  });
}
