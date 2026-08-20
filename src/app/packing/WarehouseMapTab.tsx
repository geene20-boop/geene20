"use client";

import { PackingItem } from "@/lib/types";
import { stripCode } from "@/lib/packingClient";
import { tonbagParentCategory, tonsOfItem } from "./page";

const ZONES: { category: string; no: string; bg: string }[] = [
  { category: "석회고토", no: "01", bg: "bg-amber-800" },
  { category: "입상규산", no: "02", bg: "bg-emerald-700" },
  { category: "칼슘유황", no: "03", bg: "bg-purple-700" },
];

// 창고 구역별 정원(t). 아직 구역 도면을 실측하지 않아 우선 넉넉한 기준값으로 잡아둔 것이라,
// 실제 구역 용적을 확인한 뒤에는 이 값만 바꾸면 된다.
const ZONE_CAPACITY: Record<string, number> = {
  "석회고토::bag": 4000,
  "석회고토::tonbag": 400,
  "입상규산::bag": 2000,
  "입상규산::tonbag": 400,
  "칼슘유황::bag": 1200,
  "칼슘유황::tonbag": 300,
};

function fmtTon(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function ZoneGauge({ label, tons, capacity }: { label: string; tons: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (tons / capacity) * 100) : 0;
  const state = pct >= 90 ? "high" : pct <= 10 ? "low" : "normal";
  const barColor = state === "high" ? "bg-amber-500" : state === "low" ? "bg-red-400" : "bg-emerald-600";
  const textColor = state === "high" ? "text-amber-700" : state === "low" ? "text-red-600" : "text-slate-700";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold tabular-nums ${textColor}`}>{Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
        <span>{fmtTon(tons)}t</span>
        <span>정원 {fmtTon(capacity)}t</span>
      </div>
    </div>
  );
}

export default function WarehouseMapTab({ stock }: { stock: PackingItem[] }) {
  const products = stock.filter((i) => i.kind === "product");

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">품목대분류별 적재구역</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            생산·출하를 입력하면 재고가 자동으로 바뀌고, 이 채움 표시도 함께 갱신됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />보통
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />적재 한도 임박(90%↑)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />재고 부족(10%↓)
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ZONES.map((z) => {
          const bagRows = products.filter((p) => stripCode(p.category) === z.category);
          const tonbagRows = products.filter(
            (p) => stripCode(p.category) === "톤백" && tonbagParentCategory(p.sub) === z.category
          );
          const bagTons = bagRows.reduce((s, r) => s + tonsOfItem(r), 0);
          const tonbagTons = tonbagRows.reduce((s, r) => s + tonsOfItem(r), 0);
          return (
            <div key={z.category} className="border rounded-lg overflow-hidden">
              <div className={`px-3 py-2 text-white text-sm font-bold ${z.bg}`}>
                <span className="text-xs opacity-75 mr-1">[{z.no}]</span>
                {z.category}
              </div>
              <div className="p-3 flex flex-col gap-3">
                <ZoneGauge label="포장지" tons={bagTons} capacity={ZONE_CAPACITY[`${z.category}::bag`]} />
                <ZoneGauge label="톤백" tons={tonbagTons} capacity={ZONE_CAPACITY[`${z.category}::tonbag`]} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
