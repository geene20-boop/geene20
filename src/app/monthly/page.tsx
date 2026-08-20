"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { DailySheetRow } from "@/lib/analytics";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null ? "-" : v.toFixed(digits);
}

function dday(date: string): string {
  return date.slice(8);
}

// 일 합계형 지표(비가동시간·실제 가동시간)의 합계/평균/최고/최저를 계산한다.
function levelStats(rows: { date: string; value: number }[]) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const min = rows.reduce((a, b) => (b.value < a.value ? b : a));
  return { total, average: total / rows.length, max, min };
}

// 전일 대비 증감형 지표(조립제·LNG 사용량 증감)의 평균 증감/최대 증가/최대 감소/증가·감소 일수를 계산한다.
function deltaStats(rows: { date: string; value: number }[]) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  const maxUp = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const maxDown = rows.reduce((a, b) => (b.value < a.value ? b : a));
  const upDays = rows.filter((r) => r.value > 0).length;
  const downDays = rows.filter((r) => r.value < 0).length;
  return { average: total / rows.length, maxUp, maxDown, upDays, downDays };
}

function StatCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="bg-white rounded-xl border p-4 border-l-4 border-l-slate-800">
      <h3 className="text-xs font-semibold text-slate-600 mb-2.5">{title}</h3>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span className="text-slate-400">{r.label}</span>
            <span className="font-semibold text-slate-800">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MonthlyPage() {
  const [tab, setTab] = useState<"chart" | "daily">("chart");
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<DailySheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

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

  const monthAgg = useMemo(() => {
    const daysWithData = rows.filter((r) => r.shifts.length > 0);
    const n = daysWithData.length;
    const sum = (pick: (r: DailySheetRow) => number) =>
      daysWithData.reduce((s, r) => s + pick(r), 0);
    const total = {
      downtimeHours: sum((r) => r.dayTotal.downtimeHours),
      lineHoursTotal: sum((r) => r.dayTotal.lineHoursTotal),
      granulationUsageTotal: sum((r) => r.dayTotal.granulationUsageTotal),
      gasUsageShift: sum((r) => r.dayTotal.gasUsageShift),
      packAmount: sum((r) => r.dayTotal.packAmount),
    };
    const average =
      n > 0
        ? {
            downtimeHours: total.downtimeHours / n,
            lineHoursTotal: total.lineHoursTotal / n,
            granulationUsageTotal: total.granulationUsageTotal / n,
            gasUsageShift: total.gasUsageShift / n,
            packAmount: total.packAmount / n,
          }
        : null;
    return { total, average, dayCount: n };
  }, [rows]);

  const statAgg = useMemo(() => {
    const daysWithData = rows.filter((r) => r.shifts.length > 0);
    return {
      downtime: levelStats(daysWithData.map((r) => ({ date: r.date, value: r.dayTotal.downtimeHours }))),
      lineHours: levelStats(daysWithData.map((r) => ({ date: r.date, value: r.dayTotal.lineHoursTotal }))),
      granulationDelta: deltaStats(
        rows
          .filter((r) => r.deltaFromPrevDay.granulationUsageTotal != null)
          .map((r) => ({ date: r.date, value: r.deltaFromPrevDay.granulationUsageTotal as number }))
      ),
      gasDelta: deltaStats(
        rows
          .filter((r) => r.deltaFromPrevDay.gasUsageShift != null)
          .map((r) => ({ date: r.date, value: r.deltaFromPrevDay.gasUsageShift as number }))
      ),
    };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">월간 시트</h1>
          <p className="text-sm text-slate-500 mt-1">
            한 달치 일별(주/야) 기록을 한 장의 표로 보여줍니다. 날짜를 클릭하면 주/야 상세가 펼쳐집니다.
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

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "chart", label: "월간 요약" },
            { key: "daily", label: "일자별 조회" },
          ] as const
        ).map((t) => (
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

      {tab === "chart" && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="비가동시간 (일 합계, h)"
          rows={
            statAgg.downtime
              ? [
                  { label: "이번 달 합계", value: `${fmt(statAgg.downtime.total)}h` },
                  { label: "일평균", value: `${fmt(statAgg.downtime.average)}h` },
                  { label: "최고", value: `${fmt(statAgg.downtime.max.value)}h (${dday(statAgg.downtime.max.date)})` },
                  { label: "최저", value: `${fmt(statAgg.downtime.min.value)}h (${dday(statAgg.downtime.min.date)})` },
                ]
              : [{ label: "데이터 없음", value: "-" }]
          }
        />
        <StatCard
          title="조립제 사용량 증감 (전일 대비)"
          rows={
            statAgg.granulationDelta
              ? [
                  { label: "일평균 증감", value: fmt(statAgg.granulationDelta.average) },
                  {
                    label: "최대 증가",
                    value: `+${fmt(statAgg.granulationDelta.maxUp.value)} (${dday(statAgg.granulationDelta.maxUp.date)})`,
                  },
                  {
                    label: "최대 감소",
                    value: `${fmt(statAgg.granulationDelta.maxDown.value)} (${dday(statAgg.granulationDelta.maxDown.date)})`,
                  },
                  {
                    label: "늘어난 날 / 줄어든 날",
                    value: `${statAgg.granulationDelta.upDays}일 / ${statAgg.granulationDelta.downDays}일`,
                  },
                ]
              : [{ label: "데이터 없음", value: "-" }]
          }
        />
        <StatCard
          title="실제 가동시간 (일 합계, h)"
          rows={
            statAgg.lineHours
              ? [
                  { label: "이번 달 합계", value: `${fmt(statAgg.lineHours.total)}h` },
                  { label: "일평균", value: `${fmt(statAgg.lineHours.average)}h` },
                  { label: "최고", value: `${fmt(statAgg.lineHours.max.value)}h (${dday(statAgg.lineHours.max.date)})` },
                  { label: "최저", value: `${fmt(statAgg.lineHours.min.value)}h (${dday(statAgg.lineHours.min.date)})` },
                ]
              : [{ label: "데이터 없음", value: "-" }]
          }
        />
        <StatCard
          title="LNG 사용량 증감 (전일 대비, ㎥)"
          rows={
            statAgg.gasDelta
              ? [
                  { label: "일평균 증감", value: `${fmt(statAgg.gasDelta.average)}㎥` },
                  {
                    label: "최대 증가",
                    value: `+${fmt(statAgg.gasDelta.maxUp.value)}㎥ (${dday(statAgg.gasDelta.maxUp.date)})`,
                  },
                  {
                    label: "최대 감소",
                    value: `${fmt(statAgg.gasDelta.maxDown.value)}㎥ (${dday(statAgg.gasDelta.maxDown.date)})`,
                  },
                  {
                    label: "늘어난 날 / 줄어든 날",
                    value: `${statAgg.gasDelta.upDays}일 / ${statAgg.gasDelta.downDays}일`,
                  },
                ]
              : [{ label: "데이터 없음", value: "-" }]
          }
        />
      </div>
      )}

      {tab === "daily" && (
      <div className="bg-white rounded-xl border overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
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
            {monthAgg.dayCount > 0 && (
              <>
                <tr className="bg-indigo-50 font-bold border-b-2 border-indigo-200">
                  <td className="px-3 py-2" colSpan={3}>
                    월계 (데이터 있는 {monthAgg.dayCount}일 합계)
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.total.downtimeHours)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.total.lineHoursTotal)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.total.granulationUsageTotal)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.total.gasUsageShift)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.total.packAmount, 0)}</td>
                </tr>
                <tr className="bg-indigo-50 font-bold border-b-2 border-indigo-200">
                  <td className="px-3 py-2" colSpan={3}>
                    월평균 (일 {monthAgg.dayCount}일 기준)
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.average?.downtimeHours)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.average?.lineHoursTotal)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.average?.granulationUsageTotal)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.average?.gasUsageShift)}</td>
                  <td className="px-3 py-2 text-right">{fmt(monthAgg.average?.packAmount, 0)}</td>
                </tr>
              </>
            )}
            {rows.map((day) => {
              const expanded = expandedDates.has(day.date);
              return (
                <Fragment key={day.date}>
                  {day.shifts.length === 0 && (
                    <tr className="border-t">
                      <td className="px-3 py-1.5 text-slate-400">{day.date}</td>
                      <td colSpan={8} className="px-3 py-1.5 text-slate-300">
                        기록 없음
                      </td>
                    </tr>
                  )}
                  {day.shifts.length > 0 && (
                    <tr
                      className="border-t bg-slate-50 font-medium cursor-pointer hover:bg-slate-100"
                      onClick={() => toggleDate(day.date)}
                    >
                      <td className="px-3 py-1.5" colSpan={3}>
                        <span className="inline-block w-4 text-slate-400">{expanded ? "▾" : "▸"}</span>
                        {day.date} 일계
                      </td>
                      <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.downtimeHours)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.lineHoursTotal)}</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.granulationUsageTotal)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.gasUsageShift)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(day.dayTotal.packAmount, 0)}</td>
                    </tr>
                  )}
                  {expanded &&
                    day.shifts.map((s) => (
                      <tr key={`${day.date}-${s.shift}`} className="border-t text-slate-600">
                        <td className="px-3 py-1.5"></td>
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
                </Fragment>
              );
            })}
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
      )}
    </div>
  );
}
