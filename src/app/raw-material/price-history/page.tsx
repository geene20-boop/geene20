"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { RawMaterial, RawMaterialPriceHistory } from "@/lib/types";
import { materialLabel, todayStr } from "@/lib/rawMaterialClient";

export default function RawMaterialPriceHistoryPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialKey, setMaterialKey] = useState("");
  const [rows, setRows] = useState<RawMaterialPriceHistory[]>([]);

  async function load() {
    const params = new URLSearchParams();
    if (materialKey) params.set("materialKey", materialKey);
    setRows(await apiGet<RawMaterialPriceHistory[]>(`/api/raw-material-price-history?${params.toString()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialKey]);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);
  const today = todayStr();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">단가변동 이력</h1>
        <p className="text-sm text-slate-500 mt-1">
          입고검수·입력에서 이전과 다른 단가를 입력하면 자동으로 기록되고, 이후 입력 화면 기본값이
          새 단가로 자동 채워집니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border rounded-xl px-4 py-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">원재료</span>
          <select value={materialKey} onChange={(e) => setMaterialKey(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="">전체</option>
            {materials.map((m) => (
              <option key={m.key} value={m.key}>
                {materialLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-700">변동 이력</h2>
          <a href="/api/raw-material-price-history/export" className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold">
            ⬇ 엑셀 다운로드
          </a>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">적용일</th>
              <th className="text-left px-3 py-2">원재료</th>
              <th className="text-right px-3 py-2">이전 단가</th>
              <th className="text-right px-3 py-2">신규 단가</th>
              <th className="text-right px-3 py-2">증감</th>
              <th className="text-left px-3 py-2">등록자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const material = materialByKey.get(row.material_key);
              const diff = row.old_price != null ? row.new_price - row.old_price : null;
              return (
                <tr key={row.id} className={`border-t ${row.effective_date > today ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-2">
                    {row.effective_date}
                    {row.effective_date >= today && (
                      <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5">
                        자동적용
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{material ? materialLabel(material) : row.material_key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.old_price?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.new_price.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${diff != null && diff > 0 ? "text-red-600" : diff != null && diff < 0 ? "text-emerald-700" : ""}`}>
                    {diff != null ? `${diff > 0 ? "▲" : diff < 0 ? "▼" : ""} ${Math.abs(diff).toLocaleString()}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.changed_by ?? "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  단가 변동 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
