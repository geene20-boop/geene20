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

      {(["product", "bagmat", "aux"] as const).map((kind) => (
        <div key={kind} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{KIND_LABELS[kind]}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(grouped[kind] ?? []).map((item) => (
              <div key={item.key} className="bg-white rounded-xl border p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-500">{itemLabel(item)}</span>
                <span className="text-2xl font-bold text-slate-800">
                  {fmt(item.stock)}
                  <span className="text-sm font-normal text-slate-400 ml-1">{item.unit ?? ""}</span>
                </span>
              </div>
            ))}
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
