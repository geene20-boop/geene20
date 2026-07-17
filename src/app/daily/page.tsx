"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { MergedShiftRow } from "@/lib/analytics";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function Th({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`px-2 py-1.5 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  highlight,
}: {
  children: React.ReactNode;
  className?: string;
  highlight?: "product" | "agent" | "pack" | "line" | "lng" | "gasRate";
}) {
  const highlightClass: Record<string, string> = {
    product: "bg-emerald-50 text-emerald-700 font-medium",
    agent: "bg-violet-50 text-violet-700 font-medium",
    pack: "bg-sky-50 text-sky-700 font-medium",
    line: "bg-amber-50 text-amber-700",
    lng: "bg-amber-50/60",
    gasRate: "bg-amber-100 text-amber-800 font-medium",
  };
  return (
    <td
      className={`px-2 py-1.5 text-right whitespace-nowrap tabular-nums ${
        highlight ? highlightClass[highlight] : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export default function DailyDashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<MergedShiftRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const from = `${month}-01`;
        const to = daysInMonth(month).slice(-1)[0] ?? `${month}-28`;
        const data = await apiGet<{ rows: MergedShiftRow[] }>(`/api/dashboard?from=${from}&to=${to}`);
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

  const byDate = useMemo(() => {
    const map = new Map<string, MergedShiftRow[]>();
    for (const r of rows) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    for (const list of map.values()) list.sort((a) => (a.shift === "주" ? -1 : 1));
    return map;
  }, [rows]);

  const days = useMemo(() => daysInMonth(month), [month]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">일자별 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            생산일지 원본 항목을 교대(주/야)별로 한 장의 표에서 확인합니다. 기존 엑셀 양식과 동일한
            구성에 생산품목·조립제 항목을 추가했습니다.
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

      {/* 모바일: 핵심 항목만 카드 형태로 */}
      <div className="flex flex-col gap-3 md:hidden">
        {days.map((date) => {
          const dayRows = byDate.get(date) ?? [];
          if (dayRows.length === 0) return null;
          return dayRows.map((r) => {
            const p = r.production;
            return (
              <div key={`${date}-${r.shift}-mobile`} className="bg-white rounded-xl border p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    {date} · {r.shift}조
                  </span>
                  {p?.worker && <span className="text-xs text-slate-500">{p.worker}</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <span className="text-slate-500">생산품목</span>
                  <span className="text-right text-emerald-700 font-medium">{p?.product ?? "-"}</span>
                  <span className="text-slate-500">조립제</span>
                  <span className="text-right text-violet-700 font-medium">{p?.granulation_agent ?? "-"}</span>
                  <span className="text-slate-500">포장량(ton)</span>
                  <span className="text-right text-sky-700 font-medium">{fmt(p?.daily_pack_amount, 0)}</span>
                  <span className="text-slate-500">실가동시간(h)</span>
                  <span className="text-right">{fmt(p?.line_hours_total)}</span>
                  <span className="text-slate-500">조별사용량(㎥)</span>
                  <span className="text-right">{fmt(p?.gas_usage_shift)}</span>
                  <span className="text-slate-500">가동시간당 가스(㎥/h)</span>
                  <span className="text-right text-amber-700 font-medium">{fmt(r.gasPerHour)}</span>
                  <span className="text-slate-500">수분 / 경도</span>
                  <span className="text-right">
                    {fmt(r.moisture, 2)} / {fmt(r.hardness, 2)}
                  </span>
                </div>
              </div>
            );
          });
        })}
        {!loading && rows.length === 0 && (
          <p className="text-center text-slate-400 py-8">데이터가 없습니다.</p>
        )}
      </div>

      {/* 데스크톱: 전체 항목 표 */}
      <div className="hidden md:block bg-white rounded-xl border overflow-x-auto">
        <table className="text-xs border-collapse min-w-[1900px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <Th className="text-left sticky left-0 bg-slate-50 z-20">날짜</Th>
              <Th>주/야</Th>
              <Th>작업자</Th>
              <Th>생산품목</Th>
              <Th>조립제</Th>
              <Th>일일포장량(ton)</Th>
              <Th colSpan={8} className="text-center bg-slate-100">
                설비 셋팅 정보
              </Th>
              <Th>조립제 Brix</Th>
              <Th colSpan={4} className="text-center bg-slate-100">
                라인 가동 시간 (Hr)
              </Th>
              <Th colSpan={4} className="text-center bg-slate-100">
                LNG 사용량 (㎥)
              </Th>
              <Th>가동시간당 가스사용량(㎥/h)</Th>
              <Th colSpan={2} className="text-center bg-slate-100">
                제품 품질확인
              </Th>
            </tr>
            <tr>
              <Th className="text-left sticky left-0 bg-slate-50 z-20"></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th>건조로A(℃)</Th>
              <Th>건조로B(℃)</Th>
              <Th>A호퍼(Hz)</Th>
              <Th>B호퍼(Hz)</Th>
              <Th>A/B미분(Hz)</Th>
              <Th>혼합기(Hz)</Th>
              <Th>성형기(Hz)</Th>
              <Th>투입합계(Hz)</Th>
              <Th></Th>
              <Th>A라인(h)</Th>
              <Th>B라인(h)</Th>
              <Th>비가동(h)</Th>
              <Th>실가동합계(h)</Th>
              <Th>건조로누계</Th>
              <Th>RTO누계</Th>
              <Th>조별사용량</Th>
              <Th>사용량합계(일계)</Th>
              <Th></Th>
              <Th>수분량</Th>
              <Th>경도</Th>
            </tr>
          </thead>
          <tbody>
            {days.map((date) => {
              const dayRows = byDate.get(date) ?? [];
              const dayGasTotal = dayRows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0);
              if (dayRows.length === 0) {
                return (
                  <tr key={date} className="border-b border-slate-100 text-slate-300">
                    <td className="px-2 py-1 sticky left-0 bg-white">{date}</td>
                    <td colSpan={25} className="px-2 py-1">
                      기록 없음
                    </td>
                  </tr>
                );
              }
              return dayRows.map((r, i) => {
                const p = r.production;
                return (
                  <tr key={`${date}-${r.shift}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5 sticky left-0 bg-white font-medium whitespace-nowrap">
                      {i === 0 ? date : ""}
                    </td>
                    <Td className="text-center">{r.shift}</Td>
                    <Td className="text-left">{p?.worker ?? "-"}</Td>
                    <Td highlight="product" className="text-left">
                      {p?.product ?? "-"}
                    </Td>
                    <Td highlight="agent" className="text-left">
                      {p?.granulation_agent ?? "-"}
                    </Td>
                    <Td highlight="pack">{fmt(p?.daily_pack_amount, 0)}</Td>
                    <Td>{fmt(p?.dryer_temp_a, 0)}</Td>
                    <Td>{fmt(p?.dryer_temp_b, 0)}</Td>
                    <Td>{fmt(p?.feed_hopper_a)}</Td>
                    <Td>{fmt(p?.feed_hopper_b)}</Td>
                    <Td>{fmt(p?.feed_fine_powder)}</Td>
                    <Td>{fmt(p?.feed_mixer)}</Td>
                    <Td>{fmt(p?.feed_molder)}</Td>
                    <Td>{fmt(p?.feed_total)}</Td>
                    <Td>{fmt(p?.brix)}</Td>
                    <Td>{fmt(p?.line_hours_a)}</Td>
                    <Td>{fmt(p?.line_hours_b)}</Td>
                    <Td>{fmt(p?.downtime_hours)}</Td>
                    <Td highlight="line">{fmt(p?.line_hours_total)}</Td>
                    <Td highlight="lng">{fmt(p?.lng_dryer, 0)}</Td>
                    <Td highlight="lng">{fmt(p?.lng_rto, 0)}</Td>
                    <Td highlight="lng">{fmt(p?.gas_usage_shift)}</Td>
                    <Td highlight="lng">{r.shift === "주" || i === 0 ? fmt(dayGasTotal) : ""}</Td>
                    <Td highlight="gasRate">{fmt(r.gasPerHour)}</Td>
                    <Td>{fmt(r.moisture, 2)}</Td>
                    <Td>{fmt(r.hardness, 2)}</Td>
                  </tr>
                );
              });
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={26} className="px-3 py-8 text-center text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200 inline-block" /> 생산품목
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-violet-50 border border-violet-200 inline-block" /> 조립제
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-sky-50 border border-sky-200 inline-block" /> 일일포장량
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200 inline-block" /> 실가동시간 / LNG
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> 가동시간당
          가스사용량
        </span>
      </div>
    </div>
  );
}
