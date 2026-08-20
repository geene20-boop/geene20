"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/apiClient";
import { RawMaterial } from "@/lib/types";
import {
  currentMonth,
  currentSeason,
  materialLabel,
  seasonDisplayLabel,
  shiftDate,
  shiftMonth,
  shiftSeason,
  todayStr,
} from "@/lib/rawMaterialClient";

interface DailyInboundRow {
  date: string;
  qty: number;
  dodQty: number | null;
  dodPercent: number | null;
}
interface MonthlyInboundRow {
  month: string;
  qty: number;
  yoyQty: number | null;
  yoyPercent: number | null;
}
interface SeasonInboundRow {
  season: string;
  qty: number;
  yoyQty: number | null;
  yoyPercent: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}
function fmtDelta(n: number | null, suffix: string): string {
  if (n == null) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}${suffix}`;
}
function deltaClass(n: number | null): string {
  if (n == null) return "text-slate-400";
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-red-600";
  return "text-slate-500";
}
function deltaFill(n: number | null): string {
  if (n == null) return "#cbd5e1";
  return n >= 0 ? "#10b981" : "#f43f5e";
}

const TABS = [
  { key: "daily", label: "일별" },
  { key: "monthly", label: "월별" },
  { key: "seasonal", label: "연도별(시즌)" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function RawMaterialInboundSummaryPage() {
  const [tab, setTab] = useState<Tab>("daily");
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialKey, setMaterialKey] = useState("");
  const [day, setDay] = useState(todayStr());
  const [month, setMonth] = useState(currentMonth());
  const [season, setSeason] = useState(currentSeason());
  const [daily, setDaily] = useState<DailyInboundRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyInboundRow[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonInboundRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(overrides?: { day?: string; month?: string; season?: string; materialKey?: string }) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        day: overrides?.day ?? day,
        month: overrides?.month ?? month,
        season: overrides?.season ?? season,
      });
      const mk = overrides?.materialKey ?? materialKey;
      if (mk) params.set("materialKey", mk);
      const data = await apiGet<{ daily: DailyInboundRow[]; monthly: MonthlyInboundRow[]; seasonal: SeasonInboundRow[] }>(
        `/api/raw-material-inbound-summary?${params.toString()}`
      );
      setDaily(data.daily);
      setMonthly(data.monthly);
      setSeasonal(data.seasonal);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    // 전일현황 등 다른 화면에서 특정 품목으로 좁혀서 들어온 경우 그 품목으로 바로 조회한다.
    const initialMaterial = new URLSearchParams(window.location.search).get("material") ?? "";
    if (initialMaterial) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMaterialKey(initialMaterial);
    }
    load({ materialKey: initialMaterial || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goDay(delta: number) {
    const next = shiftDate(day, delta);
    setDay(next);
    load({ day: next });
  }
  function goToday() {
    const next = todayStr();
    setDay(next);
    load({ day: next });
  }
  function goMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    load({ month: next });
  }
  function goThisMonth() {
    const next = currentMonth();
    setMonth(next);
    load({ month: next });
  }
  function goSeason(delta: number) {
    const next = shiftSeason(season, delta);
    setSeason(next);
    load({ season: next });
  }
  function goThisSeason() {
    const next = currentSeason();
    setSeason(next);
    load({ season: next });
  }
  function changeMaterial(key: string) {
    setMaterialKey(key);
    load({ materialKey: key });
  }

  const dailyChartData = useMemo(() => daily.map((r) => ({ label: r.date.slice(5), 입고량: Number(r.qty.toFixed(1)) })), [daily]);
  const monthlyChartData = useMemo(() => monthly.map((r) => ({ label: r.month.slice(2), 입고량: Number(r.qty.toFixed(1)) })), [monthly]);
  const monthlyYoyChartData = useMemo(
    () => monthly.map((r) => ({ label: r.month.slice(2), 전년동월대비: r.yoyQty != null ? Number(r.yoyQty.toFixed(1)) : 0 })),
    [monthly]
  );
  const seasonalChartData = useMemo(() => seasonal.map((r) => ({ label: r.season, 입고량: Number(r.qty.toFixed(1)) })), [seasonal]);
  const seasonalYoyChartData = useMemo(
    () => seasonal.map((r) => ({ label: r.season, 전년대비: r.yoyQty != null ? Number(r.yoyQty.toFixed(1)) : 0 })),
    [seasonal]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">입고누계</h1>
        <p className="text-sm text-slate-500 mt-1">
          &ldquo;입고검수·입력&rdquo;에서 실제로 등록한 입고 기록을 날짜 기준으로 집계합니다. 일별·월별·연도별
          모두 전날/전월/전년 버튼으로 넘겨보고, 품목별로 좁혀볼 수 있습니다.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border rounded-xl px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          품목
          <select
            value={materialKey}
            onChange={(e) => changeMaterial(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm text-slate-800"
          >
            <option value="">전체</option>
            {materials.map((m) => (
              <option key={m.key} value={m.key}>
                {materialLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <div className="w-px h-5 bg-slate-200 mx-1" />

        {tab === "daily" && (
          <>
            <button onClick={() => goDay(-1)} className="border rounded-md px-3 py-1.5 text-sm">
              ← 전날
            </button>
            <input type="date" value={day} onChange={(e) => { setDay(e.target.value); load({ day: e.target.value }); }} className="border rounded-md px-2 py-1.5 text-sm" />
            <button onClick={() => goDay(1)} className="border rounded-md px-3 py-1.5 text-sm">
              다음날 →
            </button>
            <button onClick={goToday} className="border rounded-md px-3 py-1.5 text-sm text-slate-500">
              오늘
            </button>
          </>
        )}
        {tab === "monthly" && (
          <>
            <button onClick={() => goMonth(-1)} className="border rounded-md px-3 py-1.5 text-sm">
              ← 전월
            </button>
            <span className="text-sm font-semibold text-slate-800 px-2">{month}</span>
            <button onClick={() => goMonth(1)} className="border rounded-md px-3 py-1.5 text-sm">
              다음달 →
            </button>
            <button onClick={goThisMonth} className="border rounded-md px-3 py-1.5 text-sm text-slate-500">
              이번달
            </button>
          </>
        )}
        {tab === "seasonal" && (
          <>
            <button onClick={() => goSeason(-1)} className="border rounded-md px-3 py-1.5 text-sm">
              ← 전년
            </button>
            <span className="text-sm font-semibold text-slate-800 px-2">{seasonDisplayLabel(season)}</span>
            <button onClick={() => goSeason(1)} className="border rounded-md px-3 py-1.5 text-sm">
              다음해 →
            </button>
            <button onClick={goThisSeason} className="border rounded-md px-3 py-1.5 text-sm text-slate-500">
              올해
            </button>
          </>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">불러오는 중...</p>}

      {!loading && tab === "daily" && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            일별 입고량 추이 — {shiftDate(day, -29)} ~ {day}
          </h2>
          <div className="h-64 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="입고량" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular-nums">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">날짜</th>
                  <th className="text-right px-3 py-2">입고량</th>
                  <th className="text-right px-3 py-2">전일대비</th>
                  <th className="text-right px-3 py-2">전일대비(%)</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r) => (
                  <tr key={r.date} className="border-t">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.qty)}</td>
                    <td className={`px-3 py-2 text-right ${deltaClass(r.dodQty)}`}>{fmtDelta(r.dodQty, "")}</td>
                    <td className={`px-3 py-2 text-right ${deltaClass(r.dodPercent)}`}>{fmtDelta(r.dodPercent, "%")}</td>
                  </tr>
                ))}
                {daily.every((r) => r.qty === 0) && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      해당 기간에 입고 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "monthly" && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 입고량 추이</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="입고량" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 전년동월대비 증감</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyYoyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="전년동월대비">
                  {monthly.map((r, i) => (
                    <Cell key={i} fill={deltaFill(r.yoyQty)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular-nums">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">월</th>
                  <th className="text-right px-3 py-2">입고량</th>
                  <th className="text-right px-3 py-2">전년동월</th>
                  <th className="text-right px-3 py-2">증감</th>
                  <th className="text-right px-3 py-2">증감(%)</th>
                </tr>
              </thead>
              <tbody>
                {[...monthly].reverse().map((r) => {
                  const prevQty = r.yoyQty != null ? r.qty - r.yoyQty : null;
                  return (
                    <tr key={r.month} className="border-t">
                      <td className="px-3 py-2">{r.month}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.qty)}</td>
                      <td className="px-3 py-2 text-right">{prevQty != null ? fmt(prevQty) : "-"}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyQty)}`}>{fmtDelta(r.yoyQty, "")}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyPercent)}`}>{fmtDelta(r.yoyPercent, "%")}</td>
                    </tr>
                  );
                })}
                {monthly.every((r) => r.qty === 0) && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      해당 기간에 입고 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "seasonal" && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            연도별(시즌) 입고량 추이{" "}
            <span className="text-xs font-normal text-slate-400">
              - 매년 7월 1일부터 다음해 6월 30일까지를 한 시즌(1년)으로 계산
            </span>
          </h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonalChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="입고량" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="text-sm font-semibold text-slate-700 mb-3">시즌별 전년대비 증감</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonalYoyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="전년대비">
                  {seasonal.map((r, i) => (
                    <Cell key={i} fill={deltaFill(r.yoyQty)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular-nums">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">시즌</th>
                  <th className="text-right px-3 py-2">입고량</th>
                  <th className="text-right px-3 py-2">전년</th>
                  <th className="text-right px-3 py-2">증감</th>
                  <th className="text-right px-3 py-2">증감(%)</th>
                </tr>
              </thead>
              <tbody>
                {[...seasonal].reverse().map((r) => {
                  const prevQty = r.yoyQty != null ? r.qty - r.yoyQty : null;
                  return (
                    <tr key={r.season} className="border-t">
                      <td className="px-3 py-2">{seasonDisplayLabel(r.season)}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.qty)}</td>
                      <td className="px-3 py-2 text-right">{prevQty != null ? fmt(prevQty) : "-"}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyQty)}`}>{fmtDelta(r.yoyQty, "")}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyPercent)}`}>{fmtDelta(r.yoyPercent, "%")}</td>
                    </tr>
                  );
                })}
                {seasonal.every((r) => r.qty === 0) && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      해당 기간에 입고 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
