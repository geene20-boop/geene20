"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { UtilityMonthRow, ElectricityUsage } from "@/lib/types";
import type { MergedShiftRow, YearlyUtilityRow } from "@/lib/analytics";

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
  yearly: YearlyUtilityRow[];
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

export default function UtilityPage() {
  const [monthlyTab, setMonthlyTab] = useState<
    "summary" | "production" | "byProduct" | "daily" | "monthlyYoy" | "yearlyYoy"
  >("summary");
  const [fromMonth, setFromMonth] = useState(shiftMonth(thisMonth(), -11));
  const [toMonth, setToMonth] = useState(thisMonth());
  const [data, setData] = useState<SheetResponse | null>(null);
  const [loading, setLoading] = useState(false);

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
  const yearly = useMemo(() => data?.yearly ?? [], [data]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">월별 유틸리티 통합 시트</h1>
          <p className="text-sm text-slate-500 mt-1">
            전력·LNG·경유 사용량/금액/단가와 톤당 지표, 비종별·전년동월 대비를 한 화면에서
            봅니다. 전력·생산량은 일별 입력에서 자동 합산되고, LNG(건조로/RTO)·금액·경유는{" "}
            <a href="/utility/billing" className="underline text-slate-700">실청구금액 입력</a>
            에서 월별로 입력하거나 엑셀로 업로드하면 이 표에 자동으로 반영됩니다.
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
          <a href="/utility/billing" className="text-xs border border-slate-300 rounded-md px-3 py-1.5 bg-white h-fit">
            실청구금액 입력
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

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "summary", label: "월별 유틸리티 합계" },
            { key: "production", label: "월별생산량+누계" },
            { key: "byProduct", label: "비종별 집계" },
            { key: "daily", label: "일자별 유틸증감량" },
            { key: "monthlyYoy", label: "월별 유틸증감량" },
            { key: "yearlyYoy", label: "연도별 유틸증감량" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMonthlyTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              monthlyTab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 월별 통합 표 */}
      {monthlyTab === "summary" && (
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
              <th className="px-2 py-2 text-right">건조로 LNG(㎥)</th>
              <th className="px-2 py-2 text-right">RTO LNG(㎥)</th>
              <th className="px-2 py-2 text-right bg-indigo-50">LNG 합계(㎥)</th>
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
                <td className="px-2 py-1.5 text-right">{fmt(r.lngDryerM3)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(r.lngRtoM3)}</td>
                <td className="px-2 py-1.5 text-right bg-indigo-50 font-medium">{fmt(r.lngM3)}</td>
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
                <td colSpan={16} className="px-3 py-8 text-center text-slate-400">데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* 월별 생산량 + 누계 */}
      {monthlyTab === "production" && (
      <div className="bg-white rounded-xl border p-4 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 생산량 + 누계 (ton)</h2>
          <table className="text-xs w-full tabular-nums">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left px-2 py-1.5">월</th>
                <th className="text-right px-2 py-1.5">월 생산량</th>
                <th className="text-right px-2 py-1.5">누계</th>
              </tr>
            </thead>
            <tbody>
              {cumulative.map((r) => (
                <tr key={r.month} className="border-b border-slate-100">
                  <td className="text-left px-2 py-1.5 font-medium">{r.month}</td>
                  <td className="text-right px-2 py-1.5">{fmt(r.production, 1)}</td>
                  <td className="text-right px-2 py-1.5 font-medium">{fmt(r.cumulative, 1)}</td>
                </tr>
              ))}
              {cumulative.length === 0 && (
                <tr><td colSpan={3} className="px-2 py-6 text-center text-slate-400">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
      </div>
      )}

      {/* 비종별 집계 */}
      {monthlyTab === "byProduct" && (
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
      )}

      {/* 전년동월 대비 (YoY) */}
      {monthlyTab === "monthlyYoy" && (
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">전년동월 대비 증감 (전력·LNG·경유)</h2>
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
      )}

      {/* 연도별 유틸증감량 (YoY) */}
      {monthlyTab === "yearlyYoy" && (
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">연도별 전력·가스 사용량 및 전년대비 증감</h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full tabular-nums min-w-[700px]">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left px-2 py-1.5">연도</th>
                <th className="text-right px-2 py-1.5">전력 사용량(kWh)</th>
                <th className="text-right px-2 py-1.5">전력 증감</th>
                <th className="text-right px-2 py-1.5">전력 증감%</th>
                <th className="text-right px-2 py-1.5">LNG 사용량(㎥)</th>
                <th className="text-right px-2 py-1.5">LNG 증감</th>
                <th className="text-right px-2 py-1.5">경유 사용량(ℓ)</th>
                <th className="text-right px-2 py-1.5">경유 증감</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((y) => (
                <tr key={y.year} className="border-b border-slate-100">
                  <td className="text-left px-2 py-1.5 font-medium">{y.year}</td>
                  <td className="text-right px-2 py-1.5">{fmt(y.elecTotalKwh)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.elecKwhDelta} /></td>
                  <td className="text-right px-2 py-1.5">{fmtPct(y.elecKwhPct)}</td>
                  <td className="text-right px-2 py-1.5">{fmt(y.lngM3)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.lngM3Delta} /></td>
                  <td className="text-right px-2 py-1.5">{fmt(y.dieselLiter)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={y.dieselDelta} /></td>
                </tr>
              ))}
              {yearly.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          ※ 조회기간에 포함된 연도만 표시되며, 작년 데이터가 있어야 증감이 계산됩니다.
        </p>
      </div>
      )}

      {/* 일자별 증감 그래프 */}
      {monthlyTab === "daily" && (
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
        <div className="overflow-x-auto">
          <table className="text-xs w-full tabular-nums min-w-[500px]">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left px-2 py-1.5">날짜</th>
                <th className="text-right px-2 py-1.5">전력(kWh)</th>
                <th className="text-right px-2 py-1.5">전력 증감</th>
                <th className="text-right px-2 py-1.5">가스(㎥)</th>
                <th className="text-right px-2 py-1.5">가스 증감</th>
              </tr>
            </thead>
            <tbody>
              {dailyDelta.map((d) => (
                <tr key={d.date} className="border-b border-slate-100">
                  <td className="text-left px-2 py-1.5 font-medium">{d.date}</td>
                  <td className="text-right px-2 py-1.5">{fmt(d.elec)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={d.elecDelta} /></td>
                  <td className="text-right px-2 py-1.5">{fmt(d.gas)}</td>
                  <td className="text-right px-2 py-1.5"><Delta value={d.gasDelta} /></td>
                </tr>
              ))}
              {dailyDelta.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-slate-400">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
