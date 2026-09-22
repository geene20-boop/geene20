"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { RawMaterial, RawMaterialInbound } from "@/lib/types";
import { materialLabel, shiftDate, todayStr } from "@/lib/rawMaterialClient";

export default function RawMaterialNonconformancePage() {
  const [from, setFrom] = useState(shiftDate(todayStr(), -180));
  const [to, setTo] = useState(todayStr());
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialKey, setMaterialKey] = useState("");
  const [rows, setRows] = useState<RawMaterialInbound[]>([]);

  async function load() {
    const params = new URLSearchParams({ from, to, judgment: "NG" });
    if (materialKey) params.set("materialKey", materialKey);
    setRows(await apiGet<RawMaterialInbound[]>(`/api/raw-material-inbound?${params.toString()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  function downloadXlsx() {
    const params = new URLSearchParams({ from, to });
    window.location.href = `/api/raw-material-inbound/export?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">부적합 발생이력</h1>
        <p className="text-sm text-slate-500 mt-1">
          입고검수·입력에서 NG 판정된 건이 자동으로 여기에 나타납니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border rounded-xl px-4 py-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">시작일</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">종료일</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">품목</span>
          <select value={materialKey} onChange={(e) => setMaterialKey(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="">전체</option>
            {materials.map((m) => (
              <option key={m.key} value={m.key}>
                {materialLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button onClick={load} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium">
          조회
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-700">부적합 발생 목록 ({rows.length}건)</h2>
          <button onClick={downloadXlsx} className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold">
            ⬇ 엑셀 다운로드
          </button>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">발생일자</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">업체명</th>
              <th className="text-left px-3 py-2">문제점</th>
              <th className="text-right px-3 py-2">단가</th>
              <th className="text-right px-3 py-2">금액</th>
              <th className="text-left px-3 py-2">사유</th>
              <th className="text-left px-3 py-2">조치내용</th>
              <th className="text-left px-3 py-2">비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const material = materialByKey.get(row.material_key);
              return (
                <tr key={row.id} className="border-t bg-red-50/30">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{material ? materialLabel(material) : row.material_key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qty}
                    {row.unit ?? ""}
                  </td>
                  <td className="px-3 py-2">{row.supplier_name ?? "-"}</td>
                  <td className="px-3 py-2">{row.problem ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.unit_price?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.amount?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">{row.reason ?? "-"}</td>
                  <td className="px-3 py-2">{row.action_taken ?? "-"}</td>
                  <td className="px-3 py-2">{row.vehicle_no ?? "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                  해당 조건의 부적합 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        문제점·사유·조치내용 수정은 &ldquo;입고검수·입력&rdquo; 화면에서 해당 건을 수정하면 됩니다.
      </p>
    </div>
  );
}
