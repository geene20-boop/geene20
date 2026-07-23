"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import {
  PackingItem,
  PackingEntry,
  PackingRestock,
  PackingBreakage,
  PackingReturn,
} from "@/lib/types";
import { KIND_LABELS, groupByKind, itemLabel } from "@/lib/packingClient";

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

// 톤백 제품(category="톤백")은 세부명(sub)에 적힌 이름으로 상위 대분류에 포함시킨다
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

export default function PackingStockPage() {
  const [state, setState] = useState<PackingState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiGet<PackingState>("/api/packing-state")
      .then((d) => {
        if (!cancelled) setState(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => groupByKind(state?.stock ?? []), [state]);

  const productGroups = useMemo(() => {
    const products = (state?.stock ?? []).filter((i) => i.kind === "product");
    return PRODUCT_CATEGORY_STYLE.map((style) => {
      const rows = products.filter(
        (p) =>
          p.category === style.category ||
          (p.category === "톤백" && tonbagParentCategory(p.sub) === style.category)
      );
      const subtotalTons = rows.reduce((sum, r) => sum + tonsOfItem(r), 0);
      return { ...style, rows, subtotalTons };
    }).filter((g) => g.rows.length > 0);
  }, [state]);

  const grandTotalTons = useMemo(
    () => productGroups.reduce((sum, g) => sum + g.subtotalTons, 0),
    [productGroups]
  );

  // 피벗 대분류(석회고토/입상규산/칼슘유황)에 속하지 않는 제품(예: 생생비타)은 기존처럼 단순 카드로 표시
  const leftoverProducts = useMemo(() => {
    const groupedKeys = new Set(productGroups.flatMap((g) => g.rows.map((r) => r.key)));
    return (state?.stock ?? []).filter((i) => i.kind === "product" && !groupedKeys.has(i.key));
  }, [state, productGroups]);
  const itemByKey = useMemo(() => {
    const map = new Map<string, PackingItem>();
    for (const i of state?.stock ?? []) map.set(i.key, i);
    return map;
  }, [state]);

  const recentActivity = useMemo(() => {
    if (!state) return [];
    return state.entries.map((e) => {
      const item = itemByKey.get(e.product_key);
      return {
        date: e.date,
        label: e.type === "pack" ? "생산" : "출하",
        item: item ? itemLabel(item) : e.product_key,
        qty: e.type === "pack" ? e.qty : -e.qty,
        worker: e.worker,
      };
    });
  }, [state, itemByKey]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">제품포장 재고현황</h1>
        <p className="text-sm text-slate-500 mt-1">
          제품·포장지·부자재 재고를 실시간으로 확인합니다. (최근 30일 활동 기준)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">01. 제품</h2>
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {productGroups.map((group) => (
                <Fragment key={group.category}>
                  {group.rows.map((item, idx) => (
                    <tr key={item.key} className="border-t">
                      {idx === 0 && (
                        <td
                          rowSpan={group.rows.length + 1}
                          className={`${group.bg} text-white text-center font-bold align-middle px-3 py-2 w-32 whitespace-nowrap`}
                        >
                          [{group.no}] {group.category}
                        </td>
                      )}
                      <td className="px-3 py-2 text-slate-600">{item.sub ?? item.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(item.stock)}
                        {item.unit ?? ""}
                        <span className="text-slate-400 ml-1">({fmtTon(tonsOfItem(item))}톤)</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-slate-50 font-medium">
                    <td className="px-3 py-2 text-slate-600">소합계</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtTon(group.subtotalTons)}톤</td>
                  </tr>
                </Fragment>
              ))}
              {productGroups.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                    등록된 제품이 없습니다.
                  </td>
                </tr>
              )}
              {productGroups.length > 0 && (
                <tr className="border-t bg-slate-800 text-white font-bold">
                  <td className="px-3 py-2" colSpan={2}>
                    전체합계
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtTon(grandTotalTons)}톤</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      {(["bagmat", "aux"] as const).map((kind) => (
        <div key={kind} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{KIND_LABELS[kind]}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(grouped[kind] ?? []).map((item) => {
              const low = isLowStock(item);
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border p-4 flex flex-col gap-1 ${
                    low ? "bg-red-50 border-red-300" : "bg-white"
                  }`}
                >
                  <span className={`text-xs ${low ? "text-red-600 font-medium" : "text-slate-500"}`}>
                    {itemLabel(item)}
                    {low && " (부족주의)"}
                  </span>
                  <span className={`text-2xl font-bold ${low ? "text-red-600" : "text-slate-800"}`}>
                    {fmt(item.stock)}
                    <span
                      className={`text-sm font-normal ml-1 ${low ? "text-red-400" : "text-slate-400"}`}
                    >
                      {item.unit ?? ""}
                    </span>
                  </span>
                </div>
              );
            })}
            {(grouped[kind] ?? []).length === 0 && !loading && (
              <p className="col-span-full text-sm text-slate-400">등록된 품목이 없습니다.</p>
            )}
          </div>
        </div>
      ))}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">최근 생산/출하 (30일)</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">구분</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">작업자</th>
            </tr>
          </thead>
          <tbody>
            {recentActivity.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2">{r.item}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.qty)}</td>
                <td className="px-3 py-2">{r.worker ?? "-"}</td>
              </tr>
            ))}
            {recentActivity.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  최근 30일간 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
