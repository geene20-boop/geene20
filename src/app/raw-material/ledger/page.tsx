"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { RawMaterial, RawMaterialInbound, RawMaterialSupplier, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { materialLabel, shiftDate, todayStr } from "@/lib/rawMaterialClient";
import DateNav from "@/components/DateNav";

type ViewMode = "daily" | "range";

export default function RawMaterialLedgerPage() {
  const [mode, setMode] = useState<ViewMode>("daily");
  const [date, setDate] = useState(todayStr());
  const [rangeFrom, setRangeFrom] = useState(shiftDate(todayStr(), -30));
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<RawMaterialSupplier[]>([]);
  const [category, setCategory] = useState("");
  const [materialKey, setMaterialKey] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [rows, setRows] = useState<RawMaterialInbound[]>([]);
  const [loading, setLoading] = useState(false);

  const from = mode === "daily" ? date : rangeFrom;
  const to = mode === "daily" ? date : rangeTo;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (category) params.set("category", category);
      if (materialKey) params.set("materialKey", materialKey);
      if (supplierId) params.set("supplierId", supplierId);
      setRows(await apiGet<RawMaterialInbound[]>(`/api/raw-material-inbound?${params.toString()}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    apiGet<RawMaterialSupplier[]>("/api/raw-material-supplier").then(setSuppliers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);
  const categories = useMemo(
    () => Array.from(new Set(materials.map((m) => m.category).filter((c): c is string => !!c))).sort(),
    [materials]
  );
  const materialsInCategory = useMemo(
    () => (category ? materials.filter((m) => m.category === category) : materials),
    [materials, category]
  );

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

  // 기간별 조회 시 공급처×품목별 합계를 실제 원재료수불부 서식처럼 소계 행으로 함께 보여준다.
  const groupedForRange = useMemo(() => {
    if (mode !== "range") return null;
    const groups = new Map<
      string,
      { supplierName: string; materialKey: string; materialName: string; rows: RawMaterialInbound[] }
    >();
    for (const r of rows) {
      const material = materialByKey.get(r.material_key);
      const supplierName = r.supplier_name ?? "미지정";
      const key = `${supplierName}__${r.material_key}`;
      if (!groups.has(key)) {
        groups.set(key, {
          supplierName,
          materialKey: r.material_key,
          materialName: material ? material.name : r.material_key,
          rows: [],
        });
      }
      groups.get(key)!.rows.push(r);
    }
    return Array.from(groups.values()).sort(
      (a, b) => a.supplierName.localeCompare(b.supplierName) || a.materialName.localeCompare(b.materialName)
    );
  }, [rows, materialByKey, mode]);

  function downloadXlsx() {
    const params = new URLSearchParams({ from, to });
    if (category) params.set("category", category);
    if (materialKey) params.set("materialKey", materialKey);
    if (supplierId) params.set("supplierId", supplierId);
    window.location.href = `/api/raw-material-inbound/export?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">원재료 입고대장</h1>
        <p className="text-sm text-slate-500 mt-1">
          고상·액상을 성상 컬럼으로 통일해 관리합니다. 일자별로 전날·다음날을 오가거나, 기간을 지정해
          조회할 수 있습니다. 대분류(조립제 등)·공급처로 좁혀보고, 기간별 조회 시 공급처별 합계도 함께 표시됩니다.
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

      <div className="flex flex-wrap items-end gap-2 bg-white border rounded-xl px-4 py-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">대분류</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setMaterialKey("");
            }}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">품목</span>
          <select value={materialKey} onChange={(e) => setMaterialKey(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="">전체</option>
            {materialsInCategory.map((m) => (
              <option key={m.key} value={m.key}>
                {materialLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">공급처</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="">전체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {mode === "daily" ? (
          <>
            <DateNav value={date} onChange={setDate} />
            <button onClick={load} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium">
              조회
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

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
            {mode === "range" && groupedForRange
              ? groupedForRange.flatMap((group) => {
                  const subtotalQty = group.rows.reduce((s, r) => s + r.qty, 0);
                  const subtotalAmount = group.rows.reduce((s, r) => s + (r.amount ?? 0), 0);
                  return [
                    ...group.rows.map((row) => {
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
                    }),
                    <tr key={`${group.supplierName}__${group.materialKey}__subtotal`} className="bg-amber-50 font-semibold">
                      <td colSpan={5} className="px-3 py-2 text-right text-amber-800">
                        공급처 합계 — {group.supplierName} ({group.materialName})
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-800">{subtotalQty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-amber-800">-</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-800">{subtotalAmount.toLocaleString()}</td>
                      <td></td>
                    </tr>,
                  ];
                })
              : rows.map((row) => {
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
            {mode === "range" && rows.length > 0 && (
              <tr className="bg-slate-300 font-bold">
                <td colSpan={5} className="px-3 py-2 text-right text-slate-800">
                  전체 합계
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                  {(totals.solidQty + totals.liquidQty).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-slate-800">-</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-800">{totals.amount.toLocaleString()}</td>
                <td></td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  해당 조건에 입고 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
