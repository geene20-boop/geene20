"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { apiGet, apiPost } from "@/lib/apiClient";
import { UtilityMonthRow, MonthlyUtility, ElectricityUsage } from "@/lib/types";
import type { MergedShiftRow } from "@/lib/analytics";

interface YoYRow {
  month: string;
  current: UtilityMonthRow;
  prevYear: UtilityMonthRow | null;
  elecKwhDelta: number | null;
  elecKwhPct: number | null;
  lngM3Delta: number | null;
  lngM3Pct: number | null;
  dieselDelta: number | null;
  dieselPct: number | null;
}

interface SheetResponse {
  from: string;
  to: string;
  months: string[];
  sheet: UtilityMonthRow[];
  yoy: YoYRow[];
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const fmt = (v: number | null | undefined, digits = 0): string =>
  v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const fmtPct = (v: number | null): string => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

// 큰 금액 입력 시 오타 방지용 힌트: "31,922,900원 (약 3,192만원)"
function AmountHint({ value }: { value: string }) {
  const num = Number(value);
  if (!value.trim() || Number.isNaN(num) || num === 0) return null;
  let summary = "";
  if (Math.abs(num) >= 100_000_000) summary = ` (약 ${(num / 100_000_000).toFixed(1)}억원)`;
  else if (Math.abs(num) >= 10_000) summary = ` (약 ${Math.round(num / 10_000).toLocaleString()}만원)`;
  return (
    <span className="text-[11px] text-emerald-600">
      {num.toLocaleString()}원{summary}
    </span>
  );
}

function Delta({ value, digits = 0 }: { value: number | null; digits?: number }) {
  if (value == null) return <span className="text-slate-300">-</span>;
  const up = value > 0;
  const down = value < 0;
  return (
    <span className={up ? "text-red-600" : down ? "text-blue-600" : "text-slate-500"}>
      {up ? "▲" : down ? "▼" : ""}
      {fmt(Math.abs(value), digits)}
    </span>
  );
}

type MonthlyForm = {
  month: string;
  elec1_kwh: string;
  elec1_won: string;
  elec2_kwh: string;
  elec2_won: string;
  lng_m3: string;
  lng_won: string;
  diesel_liter: string;
  diesel_won: string;
  production_ton: string;
  note: string;
};
const emptyMonthlyForm = (): MonthlyForm => ({
  month: thisMonth(),
  elec1_kwh: "",
  elec1_won: "",
  elec2_kwh: "",
  elec2_won: "",
  lng_m3: "",
  lng_won: "",
  diesel_liter: "",
  diesel_won: "",
  production_ton: "",
  note: "",
});

export default function UtilityPage() {
  const [fromMonth, setFromMonth] = useState(shiftMonth(thisMonth(), -11));
  const [toMonth, setToMonth] = useState(thisMonth());
  const [data, setData] = useState<SheetResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // 월별 입력
  const [mForm, setMForm] = useState<MonthlyForm>(emptyMonthlyForm());
  const [savingMonth, setSavingMonth] = useState(false);
  const [monthMsg, setMonthMsg] = useState<string | null>(null);

  // 일자별 증감 차트용 선택 월
  const [dailyMonth, setDailyMonth] = useState(thisMonth());
  const [dailyRows, setDailyRows] = useState<{ date: string; elec: number | null; gas: number | null }[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSheet = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiGet<SheetResponse>(`/api/utility-sheet?from=${from}&to=${to}`);
      setData(res);
    } catch (err) {
      setLoadError(`데이터를 불러오지 못했습니다: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDaily = useCallback(async (month: string) => {
    const from = `${month}-01`;
    const to = daysInMonth(month).slice(-1)[0];
    const [elec, dash] = await Promise.all([
      apiGet<ElectricityUsage[]>(`/api/electricity?from=${from}&to=${to}`),
      apiGet<{ rows: MergedShiftRow[] }>(`/api/dashboard?from=${from}&to=${to}`),
    ]);
    const elecByDate = new Map<string, number>();
    for (const e of elec) {
      if (e.usage_kwh == null) continue;
      elecByDate.set(e.date, (elecByDate.get(e.date) ?? 0) + e.usage_kwh);
    }
    const gasByDate = new Map<string, number>();
    for (const r of dash.rows) {
      const g = r.production?.gas_usage_shift;
      if (g == null) continue;
      gasByDate.set(r.date, (gasByDate.get(r.date) ?? 0) + g);
    }
    setDailyRows(
      daysInMonth(month).map((date) => ({
        date: date.slice(8),
        elec: elecByDate.has(date) ? elecByDate.get(date)! : null,
        gas: gasByDate.has(date) ? gasByDate.get(date)! : null,
      }))
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSheet(fromMonth, toMonth);
    loadDaily(dailyMonth);
    // 최초 1회만 실행 (기간 변경은 조회 버튼으로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet = useMemo(() => data?.sheet ?? [], [data]);
  const yoy = useMemo(() => data?.yoy ?? [], [data]);

  // 비종별 집계 (기간 전체)
  const productAgg = useMemo(() => {
    const prod: Record<string, number> = {};
    const elec: Record<string, number> = {};
    const gas: Record<string, number> = {};
    for (const r of sheet) {
      for (const [k, v] of Object.entries(r.productionByProduct)) prod[k] = (prod[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.elecByProduct)) elec[k] = (elec[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.lngByProduct)) gas[k] = (gas[k] ?? 0) + v;
    }
    const products = Array.from(new Set([...Object.keys(prod), ...Object.keys(elec), ...Object.keys(gas)]));
    return { products, prod, elec, gas };
  }, [sheet]);

  // 생산 누계 (월별 누적)
  const cumulative = useMemo(() => {
    const productions = sheet.map((r) => r.productionTon ?? 0);
    return sheet.map((r, i) => {
      const cum = productions.slice(0, i + 1).reduce((s, x) => s + x, 0);
      return { month: r.month.slice(2), production: r.productionTon ?? 0, cumulative: +cum.toFixed(1) };
    });
  }, [sheet]);

  // 일자별 증감(전일 대비)
  const dailyDelta = useMemo(
    () =>
      dailyRows.map((d, i) => {
        const prev = i > 0 ? dailyRows[i - 1] : null;
        const elecDelta =
          d.elec != null && prev?.elec != null ? +(d.elec - prev.elec).toFixed(1) : null;
        const gasDelta = d.gas != null && prev?.gas != null ? +(d.gas - prev.gas).toFixed(1) : null;
        return { date: d.date, elec: d.elec, gas: d.gas, elecDelta, gasDelta };
      }),
    [dailyRows]
  );

  async function saveMonth(e: React.FormEvent) {
    e.preventDefault();
    setSavingMonth(true);
    setMonthMsg(null);
    try {
      await apiPost("/api/monthly-utility", mForm);
      setMonthMsg("저장되었습니다.");
      loadSheet(fromMonth, toMonth);
    } catch (err) {
      setMonthMsg(`오류: ${(err as Error).message}`);
    } finally {
      setSavingMonth(false);
    }
  }

  function editMonth(m: MonthlyUtility) {
    setMForm({
      month: m.month,
      elec1_kwh: m.elec1_kwh?.toString() ?? "",
      elec1_won: m.elec1_won?.toString() ?? "",
      elec2_kwh: m.elec2_kwh?.toString() ?? "",
      elec2_won: m.elec2_won?.toString() ?? "",
      lng_m3: m.lng_m3?.toString() ?? "",
      lng_won: m.lng_won?.toString() ?? "",
      diesel_liter: m.diesel_liter?.toString() ?? "",
      diesel_won: m.diesel_won?.toString() ?? "",
      production_ton: m.production_ton?.toString() ?? "",
      note: m.note ?? "",
    });
  }

  const [importMsg, setImportMsg] = useState<string | null>(null);
  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/monthly-utility/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      if (json.structureError) {
        setImportMsg(`형식 오류: ${json.structureError}`);
      } else {
        setImportMsg(`반영 완료: ${json.inserted}건 처리, ${json.skipped}건 건너뜀`);
        loadSheet(fromMonth, toMonth);
      }
    } catch (err) {
      setImportMsg(`오류: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
  }

  const setMF = <K extends keyof MonthlyForm>(k: K, v: MonthlyForm[K]) =>
    setMForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">월별 유틸리티 통합 시트</h1>
          <p className="text-sm text-slate-500 mt-1">
            전력·LNG·경유 사용량/금액/단가와 톤당 지표, 비종별·전년동월 대비를 한 화면에서
            봅니다. 전력·생산량은 일별 입력에서 자동 합산되고, 금액·경유는 아래에서 월별로
            입력하거나 엑셀로 업로드합니다.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col text-xs gap-1">
            <span className="text-slate-500">시작 월</span>
            <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="border rounded-md px-2 py-1" />
          </label>
          <label className="flex flex-col text-xs gap-1">
            <span className="text-slate-500">종료 월</span>
            <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="border rounded-md px-2 py-1" />
          </label>
          <button onClick={() => loadSheet(fromMonth, toMonth)} className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-xs h-fit">
            조회
          </button>
          <a href={`/api/utility-export?from=${fromMonth}&to=${toMonth}`} className="text-xs border border-slate-300 rounded-md px-3 py-1.5 bg-white h-fit">
            엑셀 다운로드
          </a>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">불러오는 중...</p>}
      {loadError && (
        <div className="flex items-center justify-between gap-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2">
          <span>{loadError}</span>
          <button onClick={() => loadSheet(fromMonth, toMonth)} className="underline whitespace-nowrap">
            다시 시도
          </button>
        </div>
      )}

      {/* 월별 통합 표 */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="text-xs border-collapse min-w-[1400px] w-full">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-slate-50">월</th>
              <th className="px-2 py-2 text-right">1공장(kWh)</th>
              <th className="px-2 py-2 text-right">2공장(kWh)</th>
              <th className="px-2 py-2 text-right bg-indigo-50">전력합계(kWh)</th>
              <th className="px-2 py-2 text-right">전력금액(원)</th>
              <th className="px-2 py-2 text-right">전력단가</th>
              <th className="px-2 py-2 text-right">LNG(㎥)</th>
              <th className="px-2 py-2 text-right">LNG금액(원)</th>
              <th className="px-2 py-2 text-right">경유(ℓ)</th>
              <th className="px-2 py-2 text-right">경유금액(원)</th>
              <th className="px-2 py-2 text-right bg-emerald-50">생산량(t)</th>
              <th className="px-2 py-2 text-right">톤당전력</th>
              <th className="px-2 py-2 text-right">톤당LNG</th>
              <th className="px-2 py-2 text-right">톤당경유</th>
              <th className="px-2 py-2 text-right bg-amber-50">톤당금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {sheet.map((r) => (
              <tr key={r.month} className="border-t border-slate-100 hover:bg-slate-50 tabular-nums">
                <td className="px-2 py-1.5 text-left sticky left-0 bg-white font-medium">{r.month}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.elec1Kwh)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.elec2Kwh)}</td>
                <td className="px-2 py-1.5 text-right bg-indigo-50 font-medium">{fmt(r.elecTotalKwh)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.elecTotalWon)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.elecUnitPrice, 1)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.lngM3)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.lngWon)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.dieselLiter)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.dieselWon)}</td>
                <td className="px-2 py-1.5 text-right bg-emerald-50 font-medium">{fmt(r.productionTon, 1)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.elecPerTon, 1)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.lngPerTon, 1)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.dieselPerTon, 2)}</td>
                <td className="px-2 py-1.5 text-right bg-amber-50">{fmt(r.utilityWonPerTon)}</td>
              </tr>
            ))}
            {sheet.length === 0 && !loading && (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-slate-400">데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 생산 누계 + 비종별 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 생산량 + 누계 (ton)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulative}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="production" name="월 생산량" fill="#10b981" />
                <Line type="monotone" dataKey="cumulative" name="누계" stroke="#6366f1" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">비종별 집계 (선택 기간 합계)</h2>
          <table className="text-xs w-full tabular-nums">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left px-2 py-1.5">비종</th>
                <th className="text-right px-2 py-1.5">생산량(t)</th>
                <th className="text-right px-2 py-1.5">전력(kWh)</th>
                <th className="text-right px-2 py-1.5">가스(㎥)</th>
                <th className="text-right px-2 py-1.5">톤당 전력</th>
                <th className="text-right px-2 py-1.5">톤당 가스</th>
              </tr>
            </thead>
            <tbody>
              {productAgg.products.map((p) => {
                const prod = productAgg.prod[p] ?? 0;
                const el = productAgg.elec[p] ?? 0;
                const gas = productAgg.gas[p] ?? 0;
                return (
                  <tr key={p} className="border-b border-slate-100">
                    <td className="text-left px-2 py-1.5 font-medium">{p}</td>
                    <td className="text-right px-2 py-1.5">{fmt(prod, 1)}</td>
                    <td className="text-right px-2 py-1.5">{fmt(el)}</td>
                    <td className="text-right px-2 py-1.5">{fmt(gas)}</td>
                    <td className="text-right px-2 py-1.5">{prod > 0 ? fmt(el / prod, 1) : "-"}</td>
                    <td className="text-right px-2 py-1.5">{prod > 0 ? fmt(gas / prod, 1) : "-"}</td>
                  </tr>
                );
              })}
              {productAgg.products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-slate-400">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400 mt-2">
            ※ 비종별 전력·가스는 그날 생산한 비종에 귀속해 배분한 추정치입니다(하루에 여러 비종이면 균등 분할).
          </p>
        </div>
      </div>

      {/* 전년동월 대비 (YoY) */}
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">전년동월 대비 증감 (전력·LNG·경유)</h2>
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yoy.map((y) => ({ month: y.month.slice(2), 전력: y.elecKwhDelta, LNG: y.lngM3Delta, 경유: y.dieselDelta }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="전력" fill="#6366f1" />
              <Bar dataKey="LNG" fill="#f59e0b" />
              <Bar dataKey="경유" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full tabular-nums min-w-[700px]">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left px-2 py-1.5">월</th>
                <th className="text-right px-2 py-1.5">전력 올해</th>
                <th className="text-right px-2 py-1.5">전력 작년</th>
                <th className="text-right px-2 py-1.5">전력 증감</th>
                <th className="text-right px-2 py-1.5">전력 증감%</th>
                <th className="text-right px-2 py-1.5">LNG 증감</th>
                <th className="text-right px-2 py-1.5">경유 증감</th>
              </tr>
            </thead>
            <tbody>
              {yoy.map((y) => (
                <tr key={y.month} className="border-b border-slate-100">
                  <td className="text-left px-2 py-1.5 font-medium">{y.month}</td>
                  <td className="text-right px-2 py-1.5">{fmt(y.current.elecTotalKwh)}</td>
                  <td className="text-right px-2 py-1.5 text-slate-400">{fmt(y.prevYear?.elecTotalKwh ?? null)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.elecKwhDelta} /></td>
                  <td className="text-right px-2 py-1.5">{fmtPct(y.elecKwhPct)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.lngM3Delta} /></td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.dieselDelta} /></td>
                </tr>
              ))}
              {yoy.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-slate-400">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          ※ 작년 같은 달 데이터가 있어야 증감이 계산됩니다(과거 자료는 엑셀 업로드로 넣을 수 있습니다).
        </p>
      </div>

      {/* 일자별 증감 그래프 */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">일자별 전력·가스 사용량 및 전일 대비 증감</h2>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">대상 월</span>
            <input
              type="month"
              value={dailyMonth}
              onChange={(e) => {
                setDailyMonth(e.target.value);
                loadDaily(e.target.value);
              }}
              className="border rounded-md px-2 py-1"
            />
          </label>
        </div>
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyDelta}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" fontSize={10} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="elec" name="전력(kWh)" stroke="#6366f1" dot={false} connectNulls />
              <Line type="monotone" dataKey="gas" name="가스(㎥)" stroke="#f59e0b" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyDelta}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" fontSize={10} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="elecDelta" name="전력 증감" fill="#818cf8" />
              <Bar dataKey="gasDelta" name="가스 증감" fill="#fbbf24" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 월별 유틸리티 입력 + 엑셀 업로드 */}
      <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">월별 금액·경유 입력 (청구서 기준)</h2>
          <div className="flex items-center gap-2">
            <a href="/api/utility-template" className="text-xs border border-slate-300 rounded-md px-3 py-1.5">
              엑셀 양식 받기
            </a>
            <label className="text-xs border border-slate-300 rounded-md px-3 py-1.5 cursor-pointer">
              엑셀 업로드
              <input type="file" accept=".xlsx,.xls" onChange={onImport} className="hidden" />
            </label>
          </div>
        </div>
        {importMsg && <p className="text-xs text-slate-600">{importMsg}</p>}
        <form onSubmit={saveMonth} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">월</span>
            <input type="month" value={mForm.month} onChange={(e) => setMF("month", e.target.value)} className="border rounded-md px-2 py-1.5" required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">1공장 사용량(kWh)</span>
            <input type="number" step="any" value={mForm.elec1_kwh} onChange={(e) => setMF("elec1_kwh", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">1공장 금액(원)</span>
            <input type="number" step="any" value={mForm.elec1_won} onChange={(e) => setMF("elec1_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.elec1_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">2공장 사용량(kWh)</span>
            <input type="number" step="any" value={mForm.elec2_kwh} onChange={(e) => setMF("elec2_kwh", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">2공장 금액(원)</span>
            <input type="number" step="any" value={mForm.elec2_won} onChange={(e) => setMF("elec2_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.elec2_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">LNG 사용량(㎥)</span>
            <input type="number" step="any" value={mForm.lng_m3} onChange={(e) => setMF("lng_m3", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">LNG 금액(원)</span>
            <input type="number" step="any" value={mForm.lng_won} onChange={(e) => setMF("lng_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.lng_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">경유 사용량(ℓ)</span>
            <input type="number" step="any" value={mForm.diesel_liter} onChange={(e) => setMF("diesel_liter", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">경유 금액(원)</span>
            <input type="number" step="any" value={mForm.diesel_won} onChange={(e) => setMF("diesel_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.diesel_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">생산량 보정(ton)</span>
            <input type="number" step="any" value={mForm.production_ton} onChange={(e) => setMF("production_ton", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="text-slate-600">비고</span>
            <input type="text" value={mForm.note} onChange={(e) => setMF("note", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <button type="submit" disabled={savingMonth} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
              {savingMonth ? "저장 중..." : "월별 저장"}
            </button>
            {monthMsg && <span className="text-sm text-slate-600">{monthMsg}</span>}
          </div>
        </form>

        {/* 저장된 월별 값 목록 (편집용) */}
        <MonthlyList onEdit={editMonth} refreshKey={sheet.length} />
      </div>
    </div>
  );
}

function MonthlyList({ onEdit, refreshKey }: { onEdit: (m: MonthlyUtility) => void; refreshKey: number }) {
  const [rows, setRows] = useState<MonthlyUtility[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGet<MonthlyUtility[]>("/api/monthly-utility").then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full tabular-nums">
        <thead className="text-slate-500">
          <tr className="border-b">
            <th className="text-left px-2 py-1.5">월</th>
            <th className="text-right px-2 py-1.5">전력금액</th>
            <th className="text-right px-2 py-1.5">LNG금액</th>
            <th className="text-right px-2 py-1.5">경유(ℓ)</th>
            <th className="text-right px-2 py-1.5">경유금액</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month} className="border-b border-slate-100">
              <td className="text-left px-2 py-1.5 font-medium">{m.month}</td>
              <td className="text-right px-2 py-1.5">{fmt((m.elec1_won ?? 0) + (m.elec2_won ?? 0))}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.lng_won)}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.diesel_liter)}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.diesel_won)}</td>
              <td className="text-right px-2 py-1.5">
                <button onClick={() => onEdit(m)} className="text-sky-600 hover:underline">수정</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
