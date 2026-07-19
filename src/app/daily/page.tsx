"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { MergedShiftRow } from "@/lib/analytics";
import { ElectricityUsage } from "@/lib/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  return shiftDate(today(), -n);
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null
    ? "-"
    : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function avg(nums: (number | null | undefined)[]): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

type Mode = "day" | "range";

function Field({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={emphasis ? "text-xl font-bold text-slate-800" : "text-sm font-medium text-slate-700"}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}

function ShiftCard({ row }: { row: MergedShiftRow }) {
  const p = row.production;
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-slate-800">{row.shift}조</span>
        <span className="text-sm text-slate-500">{p?.worker ? `작업자: ${p.worker}` : "작업자 미입력"}</span>
      </div>

      <Section title="생산">
        <Field label="생산품목" value={p?.product ?? "-"} />
        <Field label="조립제" value={p?.granulation_agent ?? "-"} />
        <Field label="포장량(ton)" value={fmt(p?.daily_pack_amount, 0)} emphasis />
      </Section>

      <Section title="설비 셋팅">
        <Field label="건조로A(℃)" value={fmt(p?.dryer_temp_a, 0)} />
        <Field label="건조로B(℃)" value={fmt(p?.dryer_temp_b, 0)} />
        <Field label="A호퍼(Hz)" value={fmt(p?.feed_hopper_a)} />
        <Field label="B호퍼(Hz)" value={fmt(p?.feed_hopper_b)} />
        <Field label="A/B미분(Hz)" value={fmt(p?.feed_fine_powder)} />
        <Field label="혼합기(Hz)" value={fmt(p?.feed_mixer)} />
        <Field label="성형기(Hz)" value={fmt(p?.feed_molder)} />
        <Field label="투입합계(Hz)" value={fmt(p?.feed_total)} />
        <Field label="조립제 Brix" value={fmt(p?.brix)} />
      </Section>

      <Section title="가동시간(h)">
        <Field label="A라인" value={fmt(p?.line_hours_a)} />
        <Field label="B라인" value={fmt(p?.line_hours_b)} />
        <Field label="비가동" value={fmt(p?.downtime_hours)} />
        <Field label="실가동합계" value={fmt(p?.line_hours_total)} emphasis />
      </Section>

      <Section title="LNG 사용량(㎥)">
        <Field label="건조로누계" value={fmt(p?.lng_dryer, 0)} />
        <Field label="RTO누계" value={fmt(p?.lng_rto, 0)} />
        <Field label="조별사용량" value={fmt(p?.gas_usage_shift)} />
        <Field label="가동시간당 가스(㎥/h)" value={fmt(row.gasPerHour)} emphasis />
      </Section>

      <Section title="품질확인">
        <Field label="수분" value={fmt(row.moisture, 2)} />
        <Field label="경도" value={fmt(row.hardness, 2)} emphasis />
      </Section>

      {row.alerts.length > 0 && (
        <div className="flex flex-col gap-1">
          {row.alerts.map((a, i) => (
            <span
              key={i}
              className={`text-xs rounded-md px-2 py-1 border ${
                a.level === "critical"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {a.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PeriodStat({ label, total, average }: { label: string; total?: string; average?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {total != null && <span className="text-2xl font-bold text-slate-800">{total}</span>}
      {average != null && <span className="text-xs text-slate-400">평균 {average}</span>}
    </div>
  );
}

export default function DailyDashboardPage() {
  const [mode, setMode] = useState<Mode>("day");
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<MergedShiftRow[]>([]);
  const [electricity, setElectricity] = useState<ElectricityUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const rangeFrom = mode === "day" ? date : from;
  const rangeTo = mode === "day" ? date : to;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [data, elec] = await Promise.all([
          apiGet<{ rows: MergedShiftRow[] }>(`/api/dashboard?from=${rangeFrom}&to=${rangeTo}`),
          apiGet<ElectricityUsage[]>(`/api/electricity?from=${rangeFrom}&to=${rangeTo}`),
        ]);
        if (!cancelled) {
          setRows(data.rows);
          setElectricity(elec);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const dayRows = useMemo(
    () => [...rows].sort((a) => (a.shift === "주" ? -1 : 1)),
    [rows]
  );

  const dayElec = useMemo(() => {
    const entry: { "1공장": number | null; "2공장": number | null } = { "1공장": null, "2공장": null };
    for (const e of electricity) {
      if (e.date === date) entry[e.plant] = e.usage_kwh;
    }
    return entry;
  }, [electricity, date]);

  const periodAgg = useMemo(() => {
    const packAmount = rows.reduce((s, r) => s + (r.production?.daily_pack_amount ?? 0), 0);
    const lineHoursTotal = rows.reduce((s, r) => s + (r.production?.line_hours_total ?? 0), 0);
    const downtimeHours = rows.reduce((s, r) => s + (r.production?.downtime_hours ?? 0), 0);
    const gasUsageShift = rows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0);
    const elec1 = electricity
      .filter((e) => e.plant === "1공장" && e.usage_kwh != null)
      .reduce((s, e) => s + (e.usage_kwh ?? 0), 0);
    const elec2 = electricity
      .filter((e) => e.plant === "2공장" && e.usage_kwh != null)
      .reduce((s, e) => s + (e.usage_kwh ?? 0), 0);
    const dayCount = new Set(rows.map((r) => r.date)).size;
    return {
      packAmount,
      lineHoursTotal,
      downtimeHours,
      gasUsageShift,
      elec1,
      elec2,
      avgGasPerHour: avg(rows.map((r) => r.gasPerHour)),
      avgHardness: avg(rows.map((r) => r.hardness)),
      avgMoisture: avg(rows.map((r) => r.moisture)),
      dayCount,
    };
  }, [rows, electricity]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">일자별 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            하루 단위로 생산·설비·품질 기록을 크게 확인하거나, 기간을 정해 합계·평균을 확인합니다.
          </p>
        </div>
        <a
          href={`/api/daily-export?month=${(mode === "day" ? date : to).slice(0, 7)}`}
          className="text-xs border border-slate-300 rounded-md px-3 py-1.5 bg-white h-fit"
        >
          엑셀 다운로드 (해당 월)
        </a>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("day")}
          className={`text-sm font-medium rounded-md px-4 py-1.5 border ${
            mode === "day" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 text-slate-600"
          }`}
        >
          일자별 상세
        </button>
        <button
          onClick={() => setMode("range")}
          className={`text-sm font-medium rounded-md px-4 py-1.5 border ${
            mode === "range" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 text-slate-600"
          }`}
        >
          기간별 합계·평균
        </button>
      </div>

      {mode === "day" ? (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            >
              ◀ 전날
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm font-medium"
            />
            <button
              onClick={() => setDate(shiftDate(date, 1))}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            >
              다음날 ▶
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dayRows.map((r) => (
              <ShiftCard key={r.shift} row={r} />
            ))}
            {!loading && dayRows.length === 0 && (
              <p className="col-span-2 text-center text-slate-400 py-8">이 날짜에 기록이 없습니다.</p>
            )}
          </div>

          {(dayElec["1공장"] != null || dayElec["2공장"] != null) && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">전력사용량 (일계)</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="1공장(저압, kWh)" value={fmt(dayElec["1공장"], 0)} emphasis />
                <Field label="2공장(고압, kWh)" value={fmt(dayElec["2공장"], 0)} emphasis />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-end gap-3 flex-wrap bg-white rounded-xl border p-4">
            <label className="flex flex-col text-xs gap-1">
              <span className="text-slate-500">시작일</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1.5" />
            </label>
            <label className="flex flex-col text-xs gap-1">
              <span className="text-slate-500">종료일</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1.5" />
            </label>
            <span className="text-xs text-slate-400">데이터 있는 날짜 {periodAgg.dayCount}일 기준</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PeriodStat label="포장량 합계(ton)" total={fmt(periodAgg.packAmount, 0)} />
            <PeriodStat label="실가동시간 합계(h)" total={fmt(periodAgg.lineHoursTotal)} />
            <PeriodStat label="비가동시간 합계(h)" total={fmt(periodAgg.downtimeHours)} />
            <PeriodStat label="LNG 조별사용량 합계(㎥)" total={fmt(periodAgg.gasUsageShift)} />
            <PeriodStat label="가동시간당 가스(㎥/h)" average={fmt(periodAgg.avgGasPerHour)} />
            <PeriodStat label="경도" average={fmt(periodAgg.avgHardness, 2)} />
            <PeriodStat label="수분" average={fmt(periodAgg.avgMoisture, 2)} />
            <PeriodStat label="전력사용량 합계(1공장/2공장, kWh)" total={`${fmt(periodAgg.elec1, 0)} / ${fmt(periodAgg.elec2, 0)}`} />
          </div>

          {!loading && rows.length === 0 && (
            <p className="text-center text-slate-400 py-8">선택한 기간에 데이터가 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
