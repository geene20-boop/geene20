"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/apiClient";
import { DailySheetRow } from "@/lib/analytics";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null ? "-" : v.toFixed(digits);
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-300">-</span>;
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0) return <span className="text-slate-400">±0</span>;
  const up = rounded > 0;
  return (
    <span className={up ? "text-red-600" : "text-sky-600"}>
      {up ? "▲" : "▼"} {Math.abs(rounded).toLocaleString()}
    </span>
  );
}

function MiniChart({
  title,
  data,
  dataKey,
  color,
}: {
  title: string;
  data: { label: string; value: number | null }[];
  dataKey: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-xs font-semibold text-slate-600 mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
          <YAxis tick={{ fontSize: 9 }} width={32} />
          <Tooltip />
          <Line type="monotone" dataKey="value" name={dataKey} stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MonthlyPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<DailySheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await apiGet<{ month: string; rows: DailySheetRow[] }>(
          `/api/monthly-sheet?month=${month}`
        );
        if (!cancelled) setRows(data.rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const chartData = useMemo(
    () => ({
      downtime: rows.map((r) => ({ label: r.date.slice(8), value: r.dayTotal.downtimeHours || null })),
      granulationDelta: rows.map((r) => ({
        label: r.date.slice(8),
        value: r.deltaFromPrevDay.granulationUsageTotal,
      })),
      lineHours: rows.map((r) => ({ label: r.date.slice(8), value: r.dayTotal.lineHoursTotal || null })),
      gasDelta: rows.map((r) => ({ label: r.date.slice(8), value: r.deltaFromPrevDay.gasUsageShift })),
    }),
    [rows]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">월간 시트</h1>
          <p className="text-sm text-slate-500 mt-1">
            한 달치 일별(주/야) 기록을 한 장의 표로 보여줍니다. 조립제·LNG 사용량은 전일 대비 증감도
            함께 표시됩니다.
          </p>
        </div>
        <label className="flex flex-col text-xs gap-1">
          <span className="text-slate-500">대상 월</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-md px-2 py-1"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniChart title="비가동시간 (일 합계, h)" data={chartData.downtime} dataKey="비가동" color="#dc2626" />
        <MiniChart
          title="조립제 사용량 증감 (전일 대비)"
          data={chartData.granulationDelta}
          dataKey="증감"
          color="#7c3aed"
        />
        <MiniChart title="실제 가동시간 (일 합계, h)" data={chartData.lineHours} dataKey="가동시간" color="#16a34a" />
        <MiniChart
          title="LNG 사용량 증감 (전일 대비, ㎥)"
          data={chartData.gasDelta}
          dataKey="증감"
          color="#ea580c"
        />
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">조</th>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-right px-3 py-2">비가동(h)</th>
              <th className="text-right px-3 py-2">실가동(h)</th>
              <th className="text-left px-3 py-2">조립제</th>
              <th className="text-right px-3 py-2">조립제사용</th>
              <th className="text-right px-3 py-2">가스사용(㎥)</th>
              <th className="text-right px-3 py-2">포장량(ton)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((day) => (
              <Fragment key={day.date}>
                {day.shifts.length === 0 && (
                  <tr key={day.date} className="border-t">
                    <td className="px-3 py-1.5 text-slate-400">{day.date}</td>
                    <td colSpan={8} className="px-3 py-1.5 text-slate-300">
                      기록 없음
                    </td>
                  </tr>
                )}
                {day.shifts.map((s, i) => (
                  <tr key={`${day.date}-${s.shift}`} className="border-t">
                    <td className="px-3 py-1.5">{i === 0 ? day.date : ""}</td>
                    <td className="px-3 py-1.5">{s.shift}</td>
                    <td className="px-3 py-1.5">{s.worker ?? "-"}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(s.downtimeHours)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(s.lineHoursTotal)}</td>
                    <td className="px-3 py-1.5">{s.granulationAgent ?? "-"}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(s.granulationUsageTotal)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(s.gasUsageShift)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(s.packAmount, 0)}</td>
                  </tr>
                ))}
                {day.shifts.length > 0 && (
                  <tr key={`${day.date}-total`} className="bg-slate-50 font-medium">
                    <td className="px-3 py-1.5" colSpan={3}>
                      {day.date} 일계 / 전일대비 증감
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.downtimeHours)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.lineHoursTotal)}</td>
                    <td className="px-3 py-1.5"></td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex flex-col items-end">
                        <span>{fmt(day.dayTotal.granulationUsageTotal)}</span>
                        <Delta v={day.deltaFromPrevDay.granulationUsageTotal} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex flex-col items-end">
                        <span>{fmt(day.dayTotal.gasUsageShift)}</span>
                        <Delta v={day.deltaFromPrevDay.gasUsageShift} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.packAmount, 0)}</td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
