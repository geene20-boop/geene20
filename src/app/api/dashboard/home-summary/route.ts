import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSeasonProductionBagTonbag, getSeasonShipmentBagTonbag } from "@/lib/homeSummarySeason";
import { DailyAttendanceStatus, Nationality, ShiftType } from "@/lib/types";

const DISPLAY_CATEGORIES = ["석회고토", "입상규산", "칼슘유황"];

const STATUS_LABELS: Record<DailyAttendanceStatus, string> = {
  early_leave: "조퇴",
  comp_off: "대체휴무",
  late: "지각",
  absent: "결근",
  other: "기타",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

interface AttendancePerson {
  name: string;
  nationality: Nationality;
}
interface AttendanceLeaveEntry extends AttendancePerson {
  shift: "day" | "night";
  type: string;
}

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  if (dateParam && !isValidDate(dateParam)) {
    return NextResponse.json({ error: "날짜를 확인해주세요." }, { status: 400 });
  }
  const targetDate = dateParam ?? shiftDate(today(), -1);

  const db = getDb();

  // 생산량/출하량(톤) — 제품포장 생산/출하 입력 기준
  const entries = db
    .prepare(
      `SELECT pe.type as type, pe.qty as qty, pi.bag_kg as bag_kg, pi.category as category, pi.sub as sub
       FROM packing_entry pe JOIN packing_item pi ON pe.product_key = pi.key
       WHERE pe.date = ? AND pi.kind = 'product'`
    )
    .all(targetDate) as {
    type: string;
    qty: number;
    bag_kg: number | null;
    category: string | null;
    sub: string | null;
  }[];
  let productionTons = 0;
  let shipmentTons = 0;
  const productionByCat = new Map<string, number>();
  const shipmentByCat = new Map<string, number>();
  for (const e of entries) {
    const tons = (e.qty * (e.bag_kg ?? 0)) / 1000;
    const cat = classifyCategory(e.category, e.sub);
    if (e.type === "pack") {
      productionTons += tons;
      if (cat) productionByCat.set(cat, (productionByCat.get(cat) ?? 0) + tons);
    } else if (e.type === "ship") {
      shipmentTons += tons;
      if (cat) shipmentByCat.set(cat, (shipmentByCat.get(cat) ?? 0) + tons);
    }
  }
  const toByCategory = (map: Map<string, number>) =>
    DISPLAY_CATEGORIES.map((category) => ({ category, tons: Number((map.get(category) ?? 0).toFixed(1)) }));

  const seasonProduction = getSeasonProductionBagTonbag(db, targetDate);
  const seasonShipment = getSeasonShipmentBagTonbag(db, targetDate);

  // 원재료 입고
  const inboundRows = db
    .prepare(
      `SELECT ri.qty as qty, ri.judgment as judgment, rm.name as name, rm.form as form
       FROM raw_material_inbound ri JOIN raw_material rm ON ri.material_key = rm.key
       WHERE ri.date = ?`
    )
    .all(targetDate) as { qty: number; judgment: string; name: string; form: string }[];
  const inboundTotal = inboundRows.reduce((s, r) => s + r.qty, 0);
  const inboundByMaterial = new Map<string, number>();
  for (const r of inboundRows) inboundByMaterial.set(r.name, (inboundByMaterial.get(r.name) ?? 0) + r.qty);
  const inboundTop = [...inboundByMaterial.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));
  const inboundNgCount = inboundRows.filter((r) => r.judgment === "NG").length;

  // 현재 제품 재고 (품목대분류별, 톤) — 항상 "지금 시점" 실재고를 보여준다 (과거 마감재고 역산은 하지 않음)
  // 시즌누계와 동일하게, 톤백 제품(category === "톤백")은 별도로 나눠 표시할 수 있도록 함께 집계한다.
  const stockItems = db
    .prepare(`SELECT category, sub, bag_kg, stock FROM packing_item WHERE kind = 'product'`)
    .all() as { category: string | null; sub: string | null; bag_kg: number | null; stock: number }[];
  const stockByCategory = new Map<string, { bags: number; tons: number; tonbagTons: number }>();
  let stockTotalTons = 0;
  for (const it of stockItems) {
    const category = classifyCategory(it.category, it.sub);
    if (!category) continue;
    const tons = (it.stock * (it.bag_kg ?? 0)) / 1000;
    const entry = stockByCategory.get(category) ?? { bags: 0, tons: 0, tonbagTons: 0 };
    entry.bags += it.stock;
    entry.tons += tons;
    if (it.category === "톤백") entry.tonbagTons += tons;
    stockByCategory.set(category, entry);
    stockTotalTons += tons;
  }
  const stockRows = DISPLAY_CATEGORIES.map((category) => ({
    category,
    bags: Math.round(stockByCategory.get(category)?.bags ?? 0),
    tons: Number((stockByCategory.get(category)?.tons ?? 0).toFixed(1)),
    tonbagTons: Number((stockByCategory.get(category)?.tonbagTons ?? 0).toFixed(1)),
  }));

  // 근태현황: 주간조/야간조 정상출근 명단 + 연차·기타 통합 명단 (일일 출근부 로직과 동일 기준)
  const workers = db
    .prepare("SELECT id, name, nationality FROM worker WHERE active = 1 ORDER BY name")
    .all() as { id: number; name: string; nationality: Nationality }[];
  const dailyRows = db
    .prepare("SELECT worker_id, shift, status, status_detail FROM daily_attendance WHERE date = ?")
    .all(targetDate) as {
    worker_id: number;
    shift: ShiftType | null;
    status: DailyAttendanceStatus | null;
    status_detail: string | null;
  }[];
  const dailyByWorker = new Map(dailyRows.map((r) => [r.worker_id, r]));
  const leaveRows = db
    .prepare(
      `SELECT worker_id, type FROM leave_request WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
    )
    .all(targetDate, targetDate) as { worker_id: number; type: string }[];
  const leaveByWorker = new Map(leaveRows.map((r) => [r.worker_id, r]));

  const dayNormal: AttendancePerson[] = [];
  const nightNormal: AttendancePerson[] = [];
  const leaveEtc: AttendanceLeaveEntry[] = [];
  for (const w of workers) {
    const daily = dailyByWorker.get(w.id);
    const leave = leaveByWorker.get(w.id);
    const shift: ShiftType = (daily?.shift ?? "day") as ShiftType;
    const person: AttendancePerson = { name: w.name, nationality: w.nationality };

    if (leave) {
      leaveEtc.push({ ...person, shift, type: leave.type });
    } else if (daily?.status) {
      const label = `${STATUS_LABELS[daily.status]}${daily.status_detail ? ` ${daily.status_detail}` : ""}`;
      leaveEtc.push({ ...person, shift, type: label });
    } else if (shift === "night") {
      nightNormal.push(person);
    } else {
      dayNormal.push(person);
    }
  }

  // 알림: 원재료 입고검수 NG, 생산일지 미확정
  const notices: { text: string; level: "red" | "amber" }[] = [];
  if (inboundNgCount > 0) {
    notices.push({ text: `${targetDate} 원재료 입고검수 NG ${inboundNgCount}건`, level: "red" });
  }
  const prodLocks = db
    .prepare("SELECT shift, locked FROM production_log WHERE date = ?")
    .all(targetDate) as { shift: string; locked: number }[];
  const lockedByShift = new Map(prodLocks.map((r) => [r.shift, r.locked]));
  for (const shift of ["주", "야"]) {
    if (!lockedByShift.get(shift)) {
      notices.push({ text: `${targetDate} ${shift}조 생산일지 미확정`, level: "amber" });
    }
  }

  return NextResponse.json({
    date: targetDate,
    production: { tons: Number(productionTons.toFixed(1)), byCategory: toByCategory(productionByCat) },
    shipment: { tons: Number(shipmentTons.toFixed(1)), byCategory: toByCategory(shipmentByCat) },
    seasonProduction,
    seasonShipment,
    inbound: { tons: Number(inboundTotal.toFixed(1)), top: inboundTop },
    stock: { byCategory: stockRows, totalTons: Number(stockTotalTons.toFixed(1)) },
    attendance: {
      day: { normal: dayNormal },
      night: { normal: nightNormal },
      leaveEtc,
    },
    notices,
  });
}
