"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import {
  PackingItem,
  PackingEntry,
  PackingRestock,
  PackingBreakage,
  PackingReturn,
} from "@/lib/types";
import { groupByKind, itemLabel } from "@/lib/packingClient";
import ShipmentSummaryTab from "./ShipmentSummaryTab";

interface PackingState {
  stock: PackingItem[];
  entries: PackingEntry[];
  restocks: PackingRestock[];
  breakages: PackingBreakage[];
  returns: PackingReturn[];
}

function fmt(v: number | null | undefined): string {
  return v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// 부자재는 30개, 포장지는 10000매 미만이면 부족주의
const LOW_STOCK_THRESHOLD: Partial<Record<PackingItem["kind"], number>> = {
  aux: 30,
  bagmat: 10000,
};

function isLowStock(item: PackingItem): boolean {
  const threshold = LOW_STOCK_THRESHOLD[item.kind];
  return threshold != null && item.stock < threshold;
}

// 제품 재고현황을 대분류(석회고토/입상규산/칼슘유황)별로 묶어서 보여준다 (피벗 스타일).
// 생생비타처럼 무게(bag_kg)가 없어 톤 환산이 의미 없는 품목은 기존처럼 단순 카드로 따로 보여준다.
const PRODUCT_CATEGORY_STYLE = [
  { category: "석회고토", no: "01", bg: "bg-amber-800" },
  { category: "입상규산", no: "02", bg: "bg-emerald-700" },
  { category: "칼슘유황", no: "03", bg: "bg-purple-700" },
] as const;

// 실제 품목 데이터의 category/sub 앞에는 "[01]", "[A]"처럼 내부 관리번호가 붙어있을 수 있어
// (예: "[01]석회고토", "[A]무상분") 매칭·표시 전에 앞쪽 대괄호 코드를 떼어낸다.
function stripCode(s: string | null): string {
  return (s ?? "").replace(/^\[[^\]]+\]\s*/, "").trim();
}

// 톤백 제품(category가 "톤백"인 품목)은 세부명(sub)에 적힌 이름으로 상위 대분류에 포함시킨다
function tonbagParentCategory(sub: string | null): string | null {
  if (!sub) return null;
  if (sub.includes("석회고토")) return "석회고토";
  if (sub.includes("규산")) return "입상규산";
  if (sub.includes("칼슘") || sub.includes("유황")) return "칼슘유황";
  return null;
}

function tonsOfItem(item: PackingItem): number {
  return item.bag_kg ? (item.stock * item.bag_kg) / 1000 : 0;
}

function fmtTon(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// 포장지: 실제 대분류(공통=톤백내피/석회고토/입상규산/칼슘유황) 그대로 색상 구분해서 세로 목록으로 보여준다 (피벗 아님)
const BAGMAT_GROUP_STYLE: Record<string, { label: string; bg: string }> = {
  공통: { label: "톤백 내피", bg: "bg-indigo-700" },
  석회고토: { label: "석회고토 포장지", bg: "bg-amber-800" },
  입상규산: { label: "입상규산 포장지", bg: "bg-emerald-700" },
  칼슘유황: { label: "칼슘유황 포장지", bg: "bg-purple-700" },
};
const BAGMAT_GROUP_ORDER = ["공통", "석회고토", "입상규산", "칼슘유황"];

// 부자재는 실제 데이터에 별도 대분류가 없어(전부 "공통") 품목명으로 PLT류/랩핑류/탑시트류를 나눈다
function auxGroupKey(sub: string | null): string {
  const s = sub ?? "";
  if (s.includes("PLT")) return "plt";
  if (s.includes("랩핑") || s.includes("스트레치")) return "wrap";
  if (s.includes("탑시트")) return "topsheet";
  return "etc";
}
const AUX_GROUP_STYLE: Record<string, { label: string; bg: string }> = {
  plt: { label: "PLT류", bg: "bg-teal-700" },
  wrap: { label: "랩핑류", bg: "bg-pink-700" },
  topsheet: { label: "탑시트류", bg: "bg-sky-700" },
  etc: { label: "기타", bg: "bg-slate-600" },
};
const AUX_GROUP_ORDER = ["plt", "wrap", "topsheet", "etc"];

// 그룹 내 품목 단위가 모두 같으면 그 단위로, 다르면 단위 없이 개수만 합산해서 보여준다
function groupSubtotal(rows: PackingItem[]): { qty: number; unit: string | null } {
  const units = new Set(rows.map((r) => r.unit ?? ""));
  return { qty: rows.reduce((sum, r) => sum + r.stock, 0), unit: units.size === 1 ? rows[0]?.unit ?? null : null };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const TABS = [
  { key: "product", label: "01. 제품" },
  { key: "bagmat", label: "02. 포장지" },
  { key: "aux", label: "03. 부자재" },
  { key: "period", label: "04. 기간별 생산·출하" },
  { key: "shipment", label: "05. 출하누계" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function PackingStockPage() {
  const [tab, setTab] = useState<Tab>("product");
  const [state, setState] = useState<PackingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(daysAgo(30));
  const [rangeTo, setRangeTo] = useState(today());

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiGet<PackingState>(`/api/packing-state?from=${rangeFrom}&to=${rangeTo}`)
      .then((d) => {
        if (!cancelled) setState(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const grouped = useMemo(() => groupByKind(state?.stock ?? []), [state]);

  const bagmatGroups = useMemo(() => {
    const rows = grouped.bagmat ?? [];
    return BAGMAT_GROUP_ORDER.map((key) => {
      const items = rows.filter((r) => stripCode(r.category) === key);
      if (items.length === 0) return null;
      return { key, ...BAGMAT_GROUP_STYLE[key], rows: items, subtotal: groupSubtotal(items) };
    }).filter((g): g is NonNullable<typeof g> => g !== null);
  }, [grouped]);

  const auxGroups = useMemo(() => {
    const rows = grouped.aux ?? [];
    const byKey = new Map<string, PackingItem[]>();
    for (const r of rows) {
      const key = auxGroupKey(r.sub);
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
    }
    return AUX_GROUP_ORDER.map((key) => {
      const items = byKey.get(key);
      if (!items || items.length === 0) return null;
      return { key, ...AUX_GROUP_STYLE[key], rows: items, subtotal: groupSubtotal(items) };
    }).filter((g): g is NonNullable<typeof g> => g !== null);
  }, [grouped]);

  const bagmatGrandTotal = useMemo(
    () => (grouped.bagmat ?? []).reduce((sum, r) => sum + r.stock, 0),
    [grouped]
  );
  const auxGrandTotal = useMemo(
    () => (grouped.aux ?? []).reduce((sum, r) => sum + r.stock, 0),
    [grouped]
  );

  function renderGroupedKindSection(
    title: string,
    groups: { key: string; label: string; bg: string; rows: PackingItem[]; subtotal: { qty: number; unit: string | null } }[],
    grandTotal: number
  ) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <div className="bg-white rounded-xl border overflow-hidden divide-y">
          {groups.map((group) => (
            <div key={group.key}>
              <div className={`flex items-center gap-3 px-4 py-2 text-white font-bold text-sm ${group.bg}`}>
                <span className="flex-1">{group.label}</span>
                <span className="tabular-nums">
                  {fmt(group.subtotal.qty)}
                  {group.subtotal.unit ?? ""}
                </span>
              </div>
              {group.rows.map((item) => {
                const low = isLowStock(item);
                return (
                  <div key={item.key} className="flex items-center gap-3 px-6 py-2 text-sm border-t">
                    <span className="flex-1 text-slate-600">
                      {stripCode(item.sub) || stripCode(item.category) || item.key}
                    </span>
                    <span className="tabular-nums flex items-center">
                      {fmt(item.stock)}
                      {item.unit ?? ""}
                      {low && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ⚠ 부족주의
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && !loading && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">등록된 품목이 없습니다.</p>
          )}
        </div>
        {groups.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 text-white font-bold text-sm">
            <span className="flex-1">전체합계</span>
            <span className="tabular-nums">
              {fmt(grandTotal)}
              <span className="text-xs font-normal text-slate-300 ml-2">(단위가 다르면 개수만 단순 합산)</span>
            </span>
          </div>
        )}
      </div>
    );
  }

  // 대분류(석회고토 등) 안에서 다시 중분류(포장지 제품 / 톤백 제품)로 나눈다.
  // 톤백 제품이 없는 대분류(칼슘유황)는 "톤백 제품" 중분류 자체를 생략한다.
  const productGroups = useMemo(() => {
    const products = (state?.stock ?? []).filter((i) => i.kind === "product");
    return PRODUCT_CATEGORY_STYLE.map((style) => {
      const bagRows = products.filter((p) => stripCode(p.category) === style.category);
      const tonbagRows = products.filter(
        (p) => stripCode(p.category) === "톤백" && tonbagParentCategory(p.sub) === style.category
      );
      const mids = [
        { label: "포장지 제품", key: `${style.category}::bag`, rows: bagRows },
        { label: "톤백 제품", key: `${style.category}::tonbag`, rows: tonbagRows },
      ]
        .filter((m) => m.rows.length > 0)
        .map((m) => ({
          ...m,
          tons: m.rows.reduce((sum, r) => sum + tonsOfItem(r), 0),
          bags: m.rows.reduce((sum, r) => sum + r.stock, 0),
        }));
      const tons = mids.reduce((sum, m) => sum + m.tons, 0);
      return { ...style, mids, tons };
    }).filter((g) => g.mids.length > 0);
  }, [state]);

  const grandTotalTons = useMemo(
    () => productGroups.reduce((sum, g) => sum + g.tons, 0),
    [productGroups]
  );

  // 피벗 대분류(석회고토/입상규산/칼슘유황)에 속하지 않는 제품(예: 생생비타)은 기존처럼 단순 카드로 표시
  const leftoverProducts = useMemo(() => {
    const groupedKeys = new Set(
      productGroups.flatMap((g) => g.mids.flatMap((m) => m.rows.map((r) => r.key)))
    );
    return (state?.stock ?? []).filter((i) => i.kind === "product" && !groupedKeys.has(i.key));
  }, [state, productGroups]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, PackingItem>();
    for (const i of state?.stock ?? []) map.set(i.key, i);
    return map;
  }, [state]);

  const recentActivity = useMemo(() => {
    const pack: { date: string; item: string; qty: number; unit: string; tons: number }[] = [];
    const ship: { date: string; item: string; qty: number; unit: string; tons: number }[] = [];
    for (const e of state?.entries ?? []) {
      const item = itemByKey.get(e.product_key);
      const tons = item?.bag_kg ? (e.qty * item.bag_kg) / 1000 : 0;
      const row = { date: e.date, item: item ? itemLabel(item) : e.product_key, qty: e.qty, unit: item?.unit ?? "", tons };
      if (e.type === "pack") pack.push(row);
      else ship.push(row);
    }
    return { pack, ship };
  }, [state, itemByKey]);

  function sumActivity(rows: { qty: number; unit: string; tons: number }[]) {
    let bags = 0;
    let tons = 0;
    for (const r of rows) {
      if (r.unit === "포") bags += r.qty;
      tons += r.tons;
    }
    return { bags, tons };
  }
  const packTotals = useMemo(() => sumActivity(recentActivity.pack), [recentActivity]);
  const shipTotals = useMemo(() => sumActivity(recentActivity.ship), [recentActivity]);

  function renderPeriodActivityCard(title: string, rows: { date: string; item: string; qty: number; unit: string; tons: number }[], totals: { bags: number; tons: number }) {
    return (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center gap-3 px-4 pt-4 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
            />
            <span className="text-xs text-slate-400">~</span>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
            />
          </div>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.item}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(r.qty)}
                  {r.unit}
                  {r.unit !== "톤" && <span className="text-slate-400 ml-1">({fmtTon(r.tons)}톤)</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                  해당 기간에 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50 font-medium">
                <td colSpan={2} className="px-3 py-2 text-slate-600">
                  기간 합계
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(totals.bags)}포
                  <span className="text-slate-400 ml-1">({fmtTon(totals.tons)}톤)</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">제품포장 재고현황</h1>
        <p className="text-sm text-slate-500 mt-1">제품·포장지·부자재 재고를 실시간으로 확인합니다.</p>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "product" && (
        <div className="flex flex-col gap-2">
          <div className="bg-white rounded-xl border overflow-hidden divide-y">
            {productGroups.map((group) => (
              <div key={group.category}>
                <div className={`flex items-center gap-3 px-4 py-3 text-white font-bold ${group.bg}`}>
                  <span className="text-xs opacity-75">[{group.no}]</span>
                  <span className="flex-1">{group.category}</span>
                  <span className="tabular-nums">{fmtTon(group.tons)}톤</span>
                </div>
                {group.mids.map((mid) => (
                  <div key={mid.key} className="border-t">
                    <div className="flex items-center gap-3 px-6 py-2 bg-slate-50 text-sm font-medium">
                      <span className="flex-1">{mid.label}</span>
                      <span className="tabular-nums text-slate-600">
                        {mid.key.endsWith("::bag") ? (
                          <>
                            {fmt(mid.bags)}포{" "}
                            <span className="text-slate-400">({fmtTon(mid.tons)}톤)</span>
                          </>
                        ) : (
                          <>{fmtTon(mid.tons)}톤</>
                        )}
                      </span>
                    </div>
                    {mid.rows.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center gap-3 px-8 py-2 text-sm border-t bg-slate-50/60"
                      >
                        <span className="flex-1 text-slate-600">
                          {stripCode(item.sub) || stripCode(item.category) || item.key}
                        </span>
                        <span className="tabular-nums">
                          {fmt(item.stock)}
                          {item.unit ?? ""}
                          <span className="text-slate-400 ml-1">({fmtTon(tonsOfItem(item))}톤)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {productGroups.length === 0 && !loading && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">등록된 제품이 없습니다.</p>
            )}
          </div>
          {productGroups.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 text-white font-bold">
              <span className="flex-1">전체합계 (01~03 톤 환산)</span>
              <span className="tabular-nums">{fmtTon(grandTotalTons)}톤</span>
            </div>
          )}
          {leftoverProducts.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {leftoverProducts.map((item) => (
                <div key={item.key} className="bg-white rounded-xl border p-4 flex flex-col gap-1">
                  <span className="text-xs text-slate-500">{itemLabel(item)}</span>
                  <span className="text-2xl font-bold text-slate-800">
                    {fmt(item.stock)}
                    <span className="text-sm font-normal text-slate-400 ml-1">{item.unit ?? ""}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "bagmat" && renderGroupedKindSection("포장지", bagmatGroups, bagmatGrandTotal)}
      {tab === "aux" && renderGroupedKindSection("부자재", auxGroups, auxGrandTotal)}

      {tab === "period" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderPeriodActivityCard("기간별 생산누계", recentActivity.pack, packTotals)}
          {renderPeriodActivityCard("기간별 출하누계", recentActivity.ship, shipTotals)}
        </div>
      )}

      {tab === "shipment" && <ShipmentSummaryTab />}
    </div>
  );
}
