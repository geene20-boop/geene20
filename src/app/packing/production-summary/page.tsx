"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/apiClient";
import { MonthlyProductionRow, SeasonProductionRow } from "@/lib/packingProductionSummary";

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

export default function PackingProductionSummaryPage() {
  const [monthly, setMonthly] = useState<MonthlyProductionRow[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonProductionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await apiGet<{ monthly: MonthlyProductionRow[]; seasonal: SeasonProductionRow[] }>(
        "/api/packing-production-summary"
      );
      setMonthly(data.monthly);
      setSeasonal(data.seasonal);
      setLoading(false);
    })();
  }, []);

  const monthlyChartData = monthly.map((r) => ({ label: r.month.slice(2), 생산량: Number(r.tons.toFixed(1)) }));
  const seasonalChartData = seasonal.map((r) => ({ label: r.season, 생산량: Number(r.tons.toFixed(1)) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">생산누계</h1>
        <p className="text-sm text-slate-500 mt-1">
          &quot;생산/출하 입력&quot;에서 실제로 등록한 생산(포장) 기록을 날짜 기준으로 집계한 것입니다.
          기존 구글시트에서 1회성으로 가져온 과거 생산누계(품목 목록에는 이제 표시하지 않음)는 날짜별로
          나뉘어 있지 않아 이 월별/연도별 집계에는 포함되지 않습니다. 이 앱에서 새로 입력한 생산
          기록부터 정확하게 반영됩니다.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-400">불러오는 중...</p>}

      {!loading && (
        <>
          <div className="bg-white rounded-xl border p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">월별 생산량 추이 (톤)</h2>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="생산량" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full tabular-nums">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">월</th>
                    <th className="text-right px-3 py-2">생산량(톤)</th>
                    <th className="text-right px-3 py-2">전년동월대비(톤)</th>
                    <th className="text-right px-3 py-2">전년동월대비(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthly].reverse().map((r) => (
                    <tr key={r.month} className="border-t">
                      <td className="px-3 py-2">{r.month}</td>
                      <td className="px-3 py-2 text-right">{fmtTon(r.tons)}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyTons)}`}>
                        {fmtDelta(r.yoyTons, "톤")}
                      </td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyPercent)}`}>
                        {fmtDelta(r.yoyPercent, "%")}
                      </td>
                    </tr>
                  ))}
                  {monthly.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                        아직 생산(포장) 입력 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              연도별(시즌) 생산량 추이 (톤) <span className="text-xs font-normal text-slate-400">- 매년 7월 1일부터 다음해 6월 30일까지를 한 시즌(1년)으로 계산</span>
            </h2>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="생산량" fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full tabular-nums">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2">시즌</th>
                    <th className="text-right px-3 py-2">생산량(톤)</th>
                    <th className="text-right px-3 py-2">전년대비(톤)</th>
                    <th className="text-right px-3 py-2">전년대비(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...seasonal].reverse().map((r) => (
                    <tr key={r.season} className="border-t">
                      <td className="px-3 py-2">
                        {r.season.replace("-", "년 7월 ~ ")}년 6월
                      </td>
                      <td className="px-3 py-2 text-right">{fmtTon(r.tons)}</td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyTons)}`}>
                        {fmtDelta(r.yoyTons, "톤")}
                      </td>
                      <td className={`px-3 py-2 text-right ${deltaClass(r.yoyPercent)}`}>
                        {fmtDelta(r.yoyPercent, "%")}
                      </td>
                    </tr>
                  ))}
                  {seasonal.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                        아직 생산(포장) 입력 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
