"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPut } from "@/lib/apiClient";
import { MergedShiftRow, MonthlySummary } from "@/lib/analytics";
import { getWorkerComparison } from "@/lib/workerComparison";
import { useSiteSession } from "@/lib/useSiteSession";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";

function monthAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

type SpecRow = { metric: string; min_value: number | null; max_value: number | null };

const METRIC_LABEL: Record<string, string> = {
  hardness: "경도",
  moisture: "수분",
  gas_per_hour: "가동시간당 가스사용량",
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-slate-800">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

export default function DashboardPage() {
  const [tab, setTab] = useState<"summary" | "trend" | "daily" | "worker" | "spec">("summary");
  const [from, setFrom] = useState(monthAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<MergedShiftRow[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [loading, setLoading] = useState(false);
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<{ rows: MergedShiftRow[]; summary: MonthlySummary | null }>(
        `/api/dashboard?from=${from}&to=${to}&month=${month}`
      );
      setRows(data.rows);
      setSummary(data.summary);
      const s = await apiGet<SpecRow[]>("/api/specs");
      setSpecs(s);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, month]);

  const chartData = useMemo(() => {
    return [...rows]
      .sort((a, b) => (a.date + a.shift > b.date + b.shift ? 1 : -1))
      .map((r) => ({
        label: `${r.date.slice(5)} ${r.shift}`,
        hardness: r.hardness != null ? Number(r.hardness.toFixed(2)) : null,
        moisture: r.moisture != null ? Number(r.moisture.toFixed(2)) : null,
        gasPerHour: r.gasPerHour != null ? Number(r.gasPerHour.toFixed(1)) : null,
        packAmount: r.production?.daily_pack_amount ?? null,
      }));
  }, [rows]);

  const allAlerts = useMemo(
    () =>
      rows
        .flatMap((r) => r.alerts.map((a) => ({ ...a, date: r.date, shift: r.shift })))
        .sort((a, b) => (a.date + a.shift < b.date + b.shift ? 1 : -1)),
    [rows]
  );

  const workerComparison = useMemo(() => getWorkerComparison(rows), [rows]);

  async function updateSpec(metric: string, field: "min_value" | "max_value", value: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    const current = specs.find((s) => s.metric === metric) ?? { metric, min_value: null, max_value: null };
    const num = value.trim() === "" ? null : Number(value);
    const updated = { ...current, [field]: num, entered_by: enteredBy };
    const result = await apiPut<SpecRow[]>("/api/specs", updated);
    setSpecs(result);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">통합 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            생산일지 + QC측정 데이터를 자동 연동하여 집계, 이상 알림, 월간 리포트를 제공합니다.
          </p>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="flex flex-col text-xs gap-1">
            <span className="text-slate-500">기간(부터)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1" />
          </label>
          <label className="flex flex-col text-xs gap-1">
            <span className="text-slate-500">기간(까지)</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1" />
          </label>
          <label className="flex flex-col text-xs gap-1">
            <span className="text-slate-500">월간 리포트 대상월</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded-md px-2 py-1" />
          </label>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "summary", label: "요약" },
            { key: "trend", label: "추이 그래프" },
            { key: "daily", label: "일자별 기록" },
            { key: "worker", label: "작업자별 비교" },
            { key: "spec", label: "기준값 설정" },
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

      {tab === "summary" && (
      <>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="월간 총 포장량" value={`${summary.totalPackAmount.toLocaleString()} ton`} />
          <StatCard label="월간 총 가스사용량" value={`${summary.totalGasUsage.toLocaleString()} ㎥`} />
          <StatCard label="월간 총 가동시간" value={`${summary.totalLineHours.toLocaleString()} h`} />
          <StatCard label="평균 경도" value={summary.avgHardness != null ? summary.avgHardness.toFixed(2) : "-"} />
          <StatCard label="평균 수분" value={summary.avgMoisture != null ? summary.avgMoisture.toFixed(2) : "-"} />
          <StatCard
            label="이상 알림"
            value={`${summary.alertCount}건`}
            sub={summary.criticalCount > 0 ? `위험 ${summary.criticalCount}건 포함` : undefined}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">이상 알림</h2>
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {allAlerts.length === 0 && <p className="text-sm text-slate-400">이상 알림이 없습니다.</p>}
          {allAlerts.map((a, i) => (
            <div
              key={i}
              className={`text-xs rounded-md px-2 py-2 border ${
                a.level === "critical"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              <div className="font-medium">
                {a.date} {a.shift}조
              </div>
              <div>{a.message}</div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}

      {tab === "trend" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">경도 / 수분 추이</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="hardness" name="경도" stroke="#2563eb" dot={false} />
              <Line type="monotone" dataKey="moisture" name="수분" stroke="#16a34a" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">가동시간당 가스사용량 추이</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="gasPerHour" name="㎥/h" stroke="#ea580c" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {tab === "daily" && (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">일자별 통합 기록</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">조</th>
              <th className="text-right px-3 py-2">포장량</th>
              <th className="text-right px-3 py-2">가동(h)</th>
              <th className="text-right px-3 py-2">㎥/h</th>
              <th className="text-right px-3 py-2">경도</th>
              <th className="text-right px-3 py-2">수분</th>
              <th className="text-right px-3 py-2">QC건수</th>
              <th className="text-left px-3 py-2">알림</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.date}-${r.shift}`} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.shift}</td>
                <td className="px-3 py-2 text-right">{r.production?.daily_pack_amount ?? "-"}</td>
                <td className="px-3 py-2 text-right">{r.production?.line_hours_total ?? "-"}</td>
                <td className="px-3 py-2 text-right">{r.gasPerHour != null ? r.gasPerHour.toFixed(1) : "-"}</td>
                <td className="px-3 py-2 text-right">{r.hardness != null ? r.hardness.toFixed(2) : "-"}</td>
                <td className="px-3 py-2 text-right">{r.moisture != null ? r.moisture.toFixed(2) : "-"}</td>
                <td className="px-3 py-2 text-right">{r.qcTests.length}</td>
                <td className="px-3 py-2">
                  {r.alerts.length > 0 ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.alerts.some((a) => a.level === "critical")
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.alerts.length}건
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  선택한 기간에 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {tab === "worker" && (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">작업자별 비교</h2>
        <p className="text-xs text-slate-400 px-4 pt-1">
          선택한 기간(부터~까지) 내 생산일지 작업자 기준 집계입니다.
        </p>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-right px-3 py-2">근무횟수</th>
              <th className="text-right px-3 py-2">총포장량</th>
              <th className="text-right px-3 py-2">총가스사용량</th>
              <th className="text-right px-3 py-2">평균 가동시간당 가스</th>
              <th className="text-right px-3 py-2">평균 경도</th>
              <th className="text-right px-3 py-2">평균 수분</th>
              <th className="text-right px-3 py-2">알림건수</th>
            </tr>
          </thead>
          <tbody>
            {workerComparison.map((w) => (
              <tr key={w.worker} className="border-t">
                <td className="px-3 py-2 font-medium">{w.worker}</td>
                <td className="px-3 py-2 text-right">{w.shiftCount}</td>
                <td className="px-3 py-2 text-right">{w.totalPackAmount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{w.totalGasUsage.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">
                  {w.avgGasPerHour != null ? w.avgGasPerHour.toFixed(1) : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  {w.avgHardness != null ? w.avgHardness.toFixed(2) : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  {w.avgMoisture != null ? w.avgMoisture.toFixed(2) : "-"}
                </td>
                <td className="px-3 py-2 text-right">{w.alertCount}</td>
              </tr>
            ))}
            {workerComparison.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  선택한 기간에 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {tab === "spec" && (
      <div
        className={`bg-white rounded-xl border p-4 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-700 mb-2">품질/효율 기준값 설정</h2>
        {!session.canWrite && (
          <p className="text-xs text-amber-600 mb-2">조회 전용 계정은 기준값을 수정할 수 없습니다.</p>
        )}
        <div className="mb-3 max-w-xs">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
        </div>
        <div className="flex flex-col gap-3">
          {["hardness", "moisture", "gas_per_hour"].map((metric) => {
            const spec = specs.find((s) => s.metric === metric);
            return (
              <div key={metric} className="flex items-center gap-2 text-xs">
                <span className="w-32 text-slate-600">{METRIC_LABEL[metric]}</span>
                <input
                  type="number"
                  placeholder="최소"
                  defaultValue={spec?.min_value ?? ""}
                  onBlur={(e) => updateSpec(metric, "min_value", e.target.value)}
                  className="border rounded-md px-2 py-1 w-20"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  defaultValue={spec?.max_value ?? ""}
                  onBlur={(e) => updateSpec(metric, "max_value", e.target.value)}
                  className="border rounded-md px-2 py-1 w-20"
                />
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">
            기준 범위를 벗어나면 자동으로 이상 알림이 생성됩니다. (입력 후 다른 곳 클릭 시 저장)
          </p>
        </div>
      </div>
      )}
    </div>
  );
}
