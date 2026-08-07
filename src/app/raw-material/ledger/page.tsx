"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { RawMaterial, RawMaterialInbound, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { materialLabel, shiftDate, todayStr } from "@/lib/rawMaterialClient";

type ViewMode = "daily" | "range";

export default function RawMaterialLedgerPage() {
  const [mode, setMode] = useState<ViewMode>("daily");
  const [date, setDate] = useState(todayStr());
  const [rangeFrom, setRangeFrom] = useState(shiftDate(todayStr(), -30));
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [rows, setRows] = useState<RawMaterialInbound[]>([]);
  const [loading, setLoading] = useState(false);

  const from = mode === "daily" ? date : rangeFrom;
  const to = mode === "daily" ? date : rangeTo;

  async function load() {
    setLoading(true);
    try {
      setRows(await apiGet<RawMaterialInbound[]>(`/api/raw-material-inbound?from=${from}&to=${to}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  const totals = useMemo(() => {
    let solidQty = 0;
    let liquidQty = 0;
    let amount = 0;
    for (const r of rows) {
      const material = materialByKey.get(r.material_key);
      if (material?.form === "liquid") liquidQty += r.qty;
      else solidQty += r.qty;
      amount += r.amount ?? 0;
    }
    return { count: rows.length, solidQty, liquidQty, amount };
  }, [rows, materialByKey]);

  function downloadXlsx() {
    window.location.href = `/api/raw-material-inbound/export?from=${from}&to=${to}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">원재료 입고대장</h1>
        <p className="text-sm text-slate-500 mt-1">
          고상·액상을 성상 컬럼으로 통일해 관리합니다. 일자별로 전날·다음날을 오가거나, 기간을 지정해
          조회할 수 있습니다.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("daily")}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold ${
            mode === "daily" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          일자별
        </button>
        <button
          onClick={() => setMode("range")}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold ${
            mode === "range" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          기간별 조회
        </button>
      </div>

      {mode === "daily" ? (
        <div className="flex items-center gap-2 bg-white border rounded-xl px-4 py-3 w-fit">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="border rounded-md px-3 py-1.5 text-sm"
          >
            ← 전날
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="border rounded-md px-3 py-1.5 text-sm"
          >
            다음날 →
          </button>
          <button
            onClick={() => setDate(todayStr())}
            className="border rounded-md px-3 py-1.5 text-sm text-slate-500"
          >
            오늘
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 bg-white border rounded-xl px-4 py-3 w-fit">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">시작일</span>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">종료일</span>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            />
          </label>
          <button onClick={load} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium">
            조회
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">입고 건수</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{totals.count}건</div>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">고상 입고량</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{totals.solidQty.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">액상 입고량</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{totals.liquidQty.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">입고 총액</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{totals.amount.toLocaleString()}원</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-700">
            {mode === "daily" ? `${date} 입고대장` : `${from} ~ ${to} 입고대장`}
          </h2>
          <button onClick={downloadXlsx} className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold">
            ⬇ 엑셀 다운로드
          </button>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">성상</th>
              <th className="text-left px-3 py-2">공급처</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-left px-3 py-2">차량번호</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-right px-3 py-2">단가</th>
              <th className="text-right px-3 py-2">금액</th>
              <th className="text-left px-3 py-2">검수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const material = materialByKey.get(row.material_key);
              return (
                <tr key={row.id} className={`border-t ${row.judgment === "NG" ? "bg-red-50/40" : ""}`}>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{material ? RAW_MATERIAL_FORM_LABELS[material.form] : "-"}</td>
                  <td className="px-3 py-2">{row.supplier_name ?? "-"}</td>
                  <td className="px-3 py-2">{material ? materialLabel(material) : row.material_key}</td>
                  <td className="px-3 py-2">{row.vehicle_no ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qty}
                    {row.unit ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.unit_price?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.amount?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                        row.judgment === "NG" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {row.judgment}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  해당 기간에 입고 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
