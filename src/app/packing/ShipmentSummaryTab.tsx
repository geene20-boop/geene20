"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/apiClient";
import { DailyShipmentRow, MonthlyShipmentRow, SeasonShipmentRow } from "@/lib/packingShipmentSummary";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtTon(n: number): string {
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

const SUB_TABS = [
  { key: "daily", label: "일자별" },
  { key: "monthly", label: "월별" },
  { key: "seasonal", label: "시즌별" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

export default function ShipmentSummaryTab() {
  const [subTab, setSubTab] = useState<SubTab>("daily");
  const [daily, setDaily] = useState<DailyShipmentRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyShipmentRow[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  async function load(rangeFrom?: string, rangeTo?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: rangeFrom ?? from, to: rangeTo ?? to });
      const data = await apiGet<{
        daily: DailyShipmentRow[];
        monthly: MonthlyShipmentRow[];
        seasonal: SeasonShipmentRow[];
      }>(`/api/packing-shipment-summary?${params.toString()}`);
      setDaily(data.daily);
      setMonthly(data.monthly);
      setSeasonal(data.seasonal);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyChartData = daily.map((r) => ({ label: r.date.slice(5), 출하량: Number(r.tons.toFixed(1)) }));
  const monthlyChartData = monthly.map((r) => ({ label: r.month.slice(2), 출하량: Number(r.tons.toFixed(1)) }));
  const monthlyYoyChartData = monthly.map((r) => ({ label: r.month.slice(2), 전년동월대비: r.yoyTons != null ? Number(r.yoyTons.toFixed(1)) : 0 }));
  const seasonalChartData = seasonal.map((r) => ({ label: r.season, 출하량: Number(r.tons.toFixed(1)) }));
  const seasonalYoyChartData = seasonal.map((r) => ({ label: r.season, 전년대비: r.yoyTons != null ? Number(r.yoyTons.toFixed(1)) : 0 }));

  const dailyRangeTotal = daily.reduce((sum, r) => sum + r.tons, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        &quot;생산/출하 입력&quot;에서 실제로 등록한 출하 기록을 날짜 기준으로 집계한 것입니다.
      </p>

      <div className="flex gap-2 border-b">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              subTab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">불러오는 중...</p>}

      {!loading && subTab === "daily" && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700">일자별 출하량 추이 (톤)</h2>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-400">~</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => load()}
                className="border rounded-md px-3 py-1 text-xs bg-slate-900 text-white"
              >
                조회
              </button>
            </div>
          </div>
          <div className="h-64 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="출하량" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular-nums">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">날짜</th>
                  <th className="text-right px-3 py-2">출하량(톤)</th>
                  <th className="text-right px-3 py-2">전일대비(톤)</th>
                  <th className="text-right px-3 py-2">전일대비(%)</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r) => (
                  <tr key={r.date} className="border-t">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2 text-right">{fmtTon(r.tons)}</td>
                    <td className={`px-3 py-2 text-right ${deltaClass(r.dodTons)}`}>{fmtDelta(r.dodTons, "톤")}</td>
                    <td className={`px-3 py-2 text-right ${deltaClass(r.dodPercent)}`}>{fmtDelta(r.dodPercent, "%")}</td>
                  </tr>
                ))}
                {daily.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      해당 기간에 출하 입력 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              {daily.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50 font-semibold">
                    <td className="px-3 py-2">조회기간 합계</td>
                    <td className="px-3 py-2 text-right">{fmtTon(dailyRangeTotal)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {!loading && subTab === "monthly" && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 출하량 추이 (톤)</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="출하량" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 전년동월대비 증감 (톤)</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyYoyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="전년동월대비">
                  {monthly.map((r, i) => (
                    <Cell key={i} fill={deltaFill(r.yoyTons)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col divide-y">
            {[...monthly].reverse().map((r) => (
              <div key={r.month} className="py-3">
                <div className="flex items-baseline gap-3 flex-wrap mb-1">
                  <span className="text-sm font-bold text-slate-800">{r.month}</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">{fmtTon(r.tons)}톤</span>
                  <span className="text-xs text-slate-500 flex gap-3 flex-wrap">
                    <span>
                      전월대비{" "}
                      <b className={deltaClass(r.momTons)}>
                        {fmtDelta(r.momTons, "톤")} ({fmtDelta(r.momPercent, "%")})
                      </b>
                    </span>
                    <span>
                      전년동월대비{" "}
                      <b className={deltaClass(r.yoyTons)}>
                        {fmtDelta(r.yoyTons, "톤")} ({fmtDelta(r.yoyPercent, "%")})
                      </b>
                    </span>
                  </span>
                </div>
                <table className="text-xs w-full tabular-nums">
                  <tbody>
                    {r.byCategory.map((c) => (
                      <tr key={c.category} className="text-slate-500">
                        <td className="py-0.5 pl-3">{c.category}</td>
                        <td className="py-0.5 text-right">{fmtTon(c.tons)}톤</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-700 border-t border-dashed">
                      <td className="pt-1 pl-3">합계</td>
                      <td className="pt-1 text-right">{fmtTon(r.tons)}톤</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            {monthly.length === 0 && <p className="py-8 text-center text-sm text-slate-400">아직 출하 입력 기록이 없습니다.</p>}
          </div>
        </div>
      )}

      {!loading && subTab === "seasonal" && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            연도별(시즌) 출하량 추이 (톤){" "}
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
                <Bar dataKey="출하량" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h2 className="text-sm font-semibold text-slate-700 mb-3">시즌별 전년대비 증감 (톤)</h2>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonalYoyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="전년대비">
                  {seasonal.map((r, i) => (
                    <Cell key={i} fill={deltaFill(r.yoyTons)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col divide-y">
            {[...seasonal].reverse().map((r) => (
              <div key={r.season} className="py-3">
                <div className="flex items-baseline gap-3 flex-wrap mb-1">
                  <span className="text-sm font-bold text-slate-800">{r.season.replace("-", "년 7월 ~ ")}년 6월</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">{fmtTon(r.tons)}톤</span>
                  <span className="text-xs text-slate-500">
                    전년대비{" "}
                    <b className={deltaClass(r.yoyTons)}>
                      {fmtDelta(r.yoyTons, "톤")} ({fmtDelta(r.yoyPercent, "%")})
                    </b>
                  </span>
                </div>
                <table className="text-xs w-full tabular-nums">
                  <tbody>
                    {r.byCategory.map((c) => (
                      <tr key={c.category} className="text-slate-500">
                        <td className="py-0.5 pl-3">{c.category}</td>
                        <td className="py-0.5 text-right">{fmtTon(c.tons)}톤</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-700 border-t border-dashed">
                      <td className="pt-1 pl-3">합계</td>
                      <td className="pt-1 text-right">{fmtTon(r.tons)}톤</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            {seasonal.length === 0 && <p className="py-8 text-center text-sm text-slate-400">아직 출하 입력 기록이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
