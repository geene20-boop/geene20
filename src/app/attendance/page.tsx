"use client";

import { useEffect, useMemo, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { DailyAttendanceRow, DailyAttendanceStatus, LeaveBalance, LeaveRequest, LeaveType, ShiftType } from "@/lib/types";
import { markLeaveSeen } from "@/lib/leaveRead";

const LEAVE_TYPES: LeaveType[] = ["연차", "반차(오전)", "반차(오후)", "외출", "조퇴"];
const HALF_DAY_TYPES: LeaveType[] = ["반차(오전)", "반차(오후)"];
const NO_DEDUCTION_TYPES: LeaveType[] = ["외출", "조퇴"];

const STATUS_LABEL: Record<string, string> = { pending: "대기중", approved: "승인", rejected: "반려" };
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const today = () => new Date().toISOString().slice(0, 10);
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_STYLE[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function RequestForm({
  myBalance,
  approvedRequests,
  onCreated,
}: {
  myBalance: LeaveBalance | null;
  approvedRequests: LeaveRequest[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<LeaveType>("연차");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isHalfDay = HALF_DAY_TYPES.includes(type);
  const isNoDeduction = NO_DEDUCTION_TYPES.includes(type);
  const days = isNoDeduction ? 0 : isHalfDay ? 0.5 : daysBetween(startDate, endDate);
  const exceedsRemaining =
    !isNoDeduction && myBalance != null && days > 0 && days > myBalance.remaining_days;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (exceedsRemaining) {
      if (!confirm(`신청 일수(${days}일)가 잔여연차(${myBalance?.remaining_days}일)보다 많습니다. 그래도 신청하시겠습니까?`)) {
        return;
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/api/leave-request", {
        type,
        startDate,
        endDate: isHalfDay || isNoDeduction ? startDate : endDate,
        reason: reason.trim() || null,
      });
      setReason("");
      setMessage("신청되었습니다. 관리자 승인 후 반영됩니다.");
      onCreated();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const upcomingApproved = [...approvedRequests]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5);

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 flex flex-col gap-4">
      {upcomingApproved.length > 0 && (
        <div className="text-xs text-slate-600 bg-slate-50 border rounded-md px-3 py-2">
          <span className="font-medium">이미 승인된 내 일정: </span>
          {upcomingApproved
            .map((r) => `${r.start_date}${r.end_date !== r.start_date ? `~${r.end_date}` : ""}(${r.type})`)
            .join(", ")}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">신청 유형</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            className="border rounded-md px-2 py-1.5"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">시작일</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">종료일</span>
          <input
            type="date"
            value={endDate}
            disabled={isHalfDay || isNoDeduction}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-md px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">일수 (자동계산)</span>
          <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-600">{days}</div>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">사유</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="border rounded-md px-2 py-1.5"
        />
      </label>
      {exceedsRemaining && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          ⚠ 신청 일수({days}일)가 잔여연차({myBalance?.remaining_days}일)보다 많습니다. 신청은 가능하지만
          관리자 승인 시 반영되니 참고해주세요.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !startDate || (!isHalfDay && !isNoDeduction && !endDate)}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          신청하기
        </button>
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
    </form>
  );
}

function RequestList({
  rows,
  showWorkerName,
  canCancel,
  onChanged,
}: {
  rows: LeaveRequest[];
  showWorkerName: boolean;
  canCancel: boolean;
  onChanged: () => void;
}) {
  async function cancel(id: number) {
    if (!confirm("이 신청을 취소할까요?")) return;
    await apiDelete(`/api/leave-request/${id}`);
    onChanged();
  }

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">신청일</th>
            {showWorkerName && <th className="text-left px-3 py-2">신청자</th>}
            <th className="text-left px-3 py-2">유형</th>
            <th className="text-left px-3 py-2">기간</th>
            <th className="text-right px-3 py-2">일수</th>
            <th className="text-left px-3 py-2">사유</th>
            <th className="text-left px-3 py-2">상태</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.created_at.slice(0, 10)}</td>
              {showWorkerName && <td className="px-3 py-2">{r.worker_name}</td>}
              <td className="px-3 py-2">{r.type}</td>
              <td className="px-3 py-2">
                {r.start_date}
                {r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ""}
              </td>
              <td className="px-3 py-2 text-right">{r.days}</td>
              <td className="px-3 py-2 text-xs text-slate-600 max-w-[200px] truncate" title={r.reason ?? ""}>
                {r.reason ?? "-"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2 text-right">
                {canCancel && r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} className="text-red-500 hover:underline text-xs">
                    취소
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showWorkerName ? 8 : 7} className="px-3 py-8 text-center text-slate-400">
                신청 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-semibold text-slate-800">{balance.worker_name}님의 연차현황</div>
          <p className="text-xs text-slate-500 mt-0.5">
            {balance.year}년 · 오늘 기준{balance.hire_date ? ` · 입사일 ${balance.hire_date}` : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="bg-slate-50 border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-800">{balance.accrued_days}</div>
          <div className="text-xs text-slate-500 mt-1">{balance.year}년 발생연차</div>
        </div>
        <div className="bg-slate-50 border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-800">{balance.carried_over_days}</div>
          <div className="text-xs text-slate-500 mt-1">전년도 이월연차</div>
        </div>
        <div className="bg-slate-50 border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-800">{balance.used_days}</div>
          <div className="text-xs text-slate-500 mt-1">사용연차 (승인분)</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-emerald-700">{balance.remaining_days}</div>
          <div className="text-xs text-emerald-600 mt-1">잔여연차</div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        발생·이월연차는 관리자가 입력하며, 사용연차는 승인된 연차·반차 신청에서 자동 계산됩니다.
      </p>
    </div>
  );
}

function AdminBalanceTable({ rows, onSaved }: { rows: LeaveBalance[]; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<number, { accrued: string; carried: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const year = rows[0]?.year ?? new Date().getFullYear();

  function edit(workerId: number, field: "accrued" | "carried", value: string) {
    setEdits((e) => ({ ...e, [workerId]: { ...e[workerId], [field]: value } }));
  }

  async function save(row: LeaveBalance) {
    const edited = edits[row.worker_id];
    setBusyId(row.worker_id);
    try {
      await apiPost("/api/leave-balance", {
        workerId: row.worker_id,
        year: row.year,
        hireDate: row.hire_date,
        accruedDays: Number(edited?.accrued ?? row.accrued_days),
        carriedOverDays: Number(edited?.carried ?? row.carried_over_days),
      });
      onSaved();
    } finally {
      setBusyId(null);
    }
  }

  async function uploadExcel(file: File) {
    setImportMsg("업로드 중...");
    const form = new FormData();
    form.append("file", file);
    form.append("year", String(year));
    const res = await fetch("/api/leave-balance/import", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(`오류: ${data.error ?? "실패"}`);
      return;
    }
    const skippedDetails: string[] = Array.isArray(data.skippedDetails) ? data.skippedDetails : [];
    setImportMsg(
      `완료: 신규 ${data.inserted}건, 갱신 ${data.updated}건` +
        (data.skipped
          ? `, 건너뜀 ${data.skipped}건${skippedDetails.length ? ` (${skippedDetails.join(", ")})` : ""}`
          : "")
    );
    onSaved();
  }

  const avgRemaining =
    rows.length > 0 ? rows.reduce((sum, r) => sum + r.remaining_days, 0) / rows.length : 0;
  const depletedCount = rows.filter((r) => r.remaining_days <= 0).length;

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-slate-800">{rows.length}</div>
            <div className="text-xs text-slate-500 mt-1">전체 인원</div>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-slate-800">{avgRemaining.toFixed(1)}</div>
            <div className="text-xs text-slate-500 mt-1">평균 잔여연차</div>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <div className={`text-lg font-bold ${depletedCount > 0 ? "text-red-600" : "text-slate-800"}`}>
              {depletedCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">잔여연차 0 이하 인원</div>
          </div>
        </div>
      )}
    <div className="bg-white rounded-xl border overflow-x-auto">
      <div className="flex items-center justify-between px-3 pt-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{year}년 연차현황 (전 직원)</h2>
        <label className="text-xs border border-slate-300 rounded-md px-3 py-1.5 cursor-pointer bg-white">
          📎 엑셀 업로드 (성명/입사일/발생연차/전년도잔여연차)
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadExcel(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {importMsg && <p className="text-xs text-slate-500 px-3 pt-1">{importMsg}</p>}
      <table className="w-full text-sm mt-2">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">성명</th>
            <th className="text-right px-3 py-2">발생연차</th>
            <th className="text-right px-3 py-2">이월연차</th>
            <th className="text-right px-3 py-2">사용연차</th>
            <th className="text-right px-3 py-2">잔여연차</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.worker_id} className="border-t">
              <td className="px-3 py-2">{r.worker_name}</td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  step="any"
                  defaultValue={r.accrued_days}
                  onChange={(e) => edit(r.worker_id, "accrued", e.target.value)}
                  className="border rounded-md px-2 py-1 w-20 text-right"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  step="any"
                  defaultValue={r.carried_over_days}
                  onChange={(e) => edit(r.worker_id, "carried", e.target.value)}
                  className="border rounded-md px-2 py-1 w-20 text-right"
                />
              </td>
              <td className="px-3 py-2 text-right text-slate-500">{r.used_days}</td>
              <td className="px-3 py-2 text-right font-medium text-emerald-700">{r.remaining_days}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => save(r)}
                  disabled={busyId === r.worker_id}
                  className="text-xs border rounded-md px-2 py-1 disabled:opacity-50"
                >
                  저장
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                근로자명부가 비어있습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function MonthlyDetailCard({ balance }: { balance: LeaveBalance }) {
  return (
    <div className="bg-white rounded-xl border p-5 overflow-x-auto">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="font-semibold text-slate-800">
            {balance.worker_name}님의 연차현황 상세{balance.hire_date ? ` · 입사일 ${balance.hire_date}` : ""}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{balance.year}년 · 월별 사용일수</p>
        </div>
        <a
          href={`/api/leave-balance/export?year=${balance.year}&workerId=${balance.worker_id}`}
          className="text-xs border rounded-md px-3 py-1.5 bg-white"
        >
          ⬇ 엑셀 다운로드
        </a>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">구분</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="text-right px-3 py-2">
                {m}
              </th>
            ))}
            <th className="text-right px-3 py-2">합계</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t">
            <td className="px-3 py-2">사용일</td>
            {balance.monthly_used_days.map((d, i) => (
              <td key={i} className="px-3 py-2 text-right">
                {d || "-"}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-medium">
              {balance.monthly_used_days.reduce((a, b) => a + b, 0)}일
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AdminMonthlyDetailTable({ rows, year }: { rows: LeaveBalance[]; year: number }) {
  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <div className="flex items-center justify-between px-3 pt-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{year}년 연차현황 상세 (전 직원)</h2>
        <a href={`/api/leave-balance/export?year=${year}`} className="text-xs border rounded-md px-3 py-1.5 bg-white">
          ⬇ 엑셀 다운로드
        </a>
      </div>
      <table className="w-full text-sm mt-2">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">이름</th>
            <th className="text-left px-3 py-2">입사일</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="text-right px-3 py-2">
                {m}
              </th>
            ))}
            <th className="text-right px-3 py-2">합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.worker_id} className="border-t">
              <td className="px-3 py-2">{r.worker_name}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.hire_date ?? "-"}</td>
              {r.monthly_used_days.map((d, i) => (
                <td key={i} className="px-3 py-2 text-right">
                  {d || "-"}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium">
                {r.monthly_used_days.reduce((a, b) => a + b, 0)}일
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={15} className="px-3 py-8 text-center text-slate-400">
                근로자명부가 비어있습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const SHIFT_LABELS: Record<ShiftType, string> = { day: "주간", night: "야간" };
type UiDailyStatus = DailyAttendanceStatus | "normal";
const DAILY_STATUS_OPTIONS: UiDailyStatus[] = ["normal", "early_leave", "comp_off", "late", "absent", "other"];
const DAILY_STATUS_LABELS: Record<UiDailyStatus, string> = {
  normal: "정상출근",
  early_leave: "조퇴",
  comp_off: "대체휴무",
  late: "지각",
  absent: "결근",
  other: "기타",
};

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function DailyRosterRow({ row, onChanged }: { row: DailyAttendanceRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<UiDailyStatus>(row.status ?? "normal");
  const [detail, setDetail] = useState(row.statusDetail ?? "");

  async function saveShift(shift: ShiftType) {
    setBusy(true);
    try {
      await apiPut("/api/daily-attendance", { workerId: row.worker_id, date: row.date, shift });
      onChanged();
    } catch (err) {
      alert(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(nextStatus: UiDailyStatus, nextDetail: string) {
    setBusy(true);
    try {
      const isNormal = nextStatus === "normal";
      await apiPut("/api/daily-attendance", {
        workerId: row.worker_id,
        date: row.date,
        status: isNormal ? null : nextStatus,
        statusDetail: isNormal ? null : nextDetail.trim() || null,
      });
      onChanged();
    } catch (err) {
      alert(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2">{row.worker_name}</td>
      <td className="px-3 py-2">
        <span
          className={`text-xs border rounded-full px-2 py-0.5 ${
            row.nationality === "foreign"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-sky-50 text-sky-700 border-sky-200"
          }`}
        >
          {row.nationality === "foreign" ? "외국인" : "내국인"}
        </span>
      </td>
      <td className="px-3 py-2">
        <select
          value={row.shift ?? "day"}
          disabled={busy}
          onChange={(e) => saveShift(e.target.value as ShiftType)}
          className="border rounded-md px-2 py-1 text-sm"
        >
          <option value="day">{SHIFT_LABELS.day}</option>
          <option value="night">{SHIFT_LABELS.night}</option>
        </select>
      </td>
      <td className="px-3 py-2">
        {row.statusSource === "auto" ? (
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-2 py-1">
            {row.statusLabel}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as UiDailyStatus;
                setStatus(next);
                if (next === "normal") setDetail("");
                saveStatus(next, next === "normal" ? "" : detail);
              }}
              className="border rounded-md px-2 py-1 text-sm"
            >
              {DAILY_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {DAILY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <input
              value={detail}
              disabled={busy || status === "normal"}
              onChange={(e) => setDetail(e.target.value)}
              onBlur={() => saveStatus(status, detail)}
              placeholder="비고(예: 14:00)"
              className="border rounded-md px-2 py-1 text-sm w-28"
            />
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{row.note ?? "-"}</td>
    </tr>
  );
}

type ShiftFilter = "all" | ShiftType;
const SHIFT_FILTER_LABELS: Record<ShiftFilter, string> = { all: "전체", day: "주간", night: "야간" };

function DailyRosterTab() {
  const [date, setDate] = useState(today());
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [rows, setRows] = useState<DailyAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiGet<DailyAttendanceRow[]>(`/api/daily-attendance?date=${date}`);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T00:00:00Z`).getUTCDay()];
  const filteredRows = shiftFilter === "all" ? rows : rows.filter((r) => r.shift === shiftFilter);

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 text-sm">일일 출근부</span>
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, -1))}
            className="border rounded-md px-3 py-1 text-xs bg-white"
          >
            ◀ 전날
          </button>
          <span className="text-xs text-slate-600 border rounded-md px-3 py-1">
            {date} ({weekday})
          </span>
          <button
            type="button"
            onClick={() => setDate((d) => addDays(d, 1))}
            className="border rounded-md px-3 py-1 text-xs bg-white"
          >
            다음날 ▶
          </button>
          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as ShiftFilter)}
            className="border rounded-md px-2 py-1 text-xs bg-white"
          >
            {(["all", "day", "night"] as ShiftFilter[]).map((f) => (
              <option key={f} value={f}>
                {SHIFT_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <a
          href={`/api/daily-attendance/export?date=${date}${shiftFilter !== "all" ? `&shift=${shiftFilter}` : ""}`}
          className="text-xs border rounded-md px-3 py-1.5 bg-white"
        >
          ⬇ 엑셀 다운로드
        </a>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">이름</th>
            <th className="text-left px-3 py-2">국적</th>
            <th className="text-left px-3 py-2">근무조</th>
            <th className="text-left px-3 py-2">근태현황</th>
            <th className="text-left px-3 py-2">비고</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((r) => (
            <DailyRosterRow key={r.worker_id} row={r} onChanged={refresh} />
          ))}
          {!loading && filteredRows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                {rows.length === 0 ? "근로자명부가 비어있습니다." : "해당 근무조 인원이 없습니다."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 px-3 py-3">
        • 근무조는 근로자명부 기본값이 자동으로 채워지고, 관리자가 그날만 바꾸면 즉시 저장됩니다.
        <br />
        • 근태현황은 본인이 신청해 승인된 연차·반차·외출·조퇴가 있으면 자동으로 채워지고 수정할 수 없습니다(초록 표시).
        <br />
        • 자동반영 내용이 없는 경우(주로 외국인 근로자)에는 관리자가 드롭다운과 비고를 직접 입력·수정합니다.
      </p>
    </div>
  );
}

function AdminApprovalTable({
  rows,
  onChanged,
  canReject,
}: {
  rows: LeaveRequest[];
  onChanged: () => void;
  canReject: boolean;
}) {
  const [bulkBusy, setBulkBusy] = useState(false);

  async function decide(id: number, status: "approved" | "rejected") {
    await apiPut(`/api/leave-request/${id}`, { status });
    onChanged();
  }

  async function approveAll() {
    if (!confirm(`대기중인 신청 ${rows.length}건을 모두 승인할까요?`)) return;
    setBulkBusy(true);
    try {
      for (const r of rows) {
        await apiPut(`/api/leave-request/${r.id}`, { status: "approved" });
      }
      onChanged();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      {rows.length > 0 && (
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={approveAll}
            disabled={bulkBusy}
            className="text-xs bg-slate-900 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            전체 승인 ({rows.length}건)
          </button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">신청자</th>
            <th className="text-left px-3 py-2">유형</th>
            <th className="text-left px-3 py-2">기간</th>
            <th className="text-right px-3 py-2">일수</th>
            <th className="text-left px-3 py-2">사유</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.worker_name}</td>
              <td className="px-3 py-2">{r.type}</td>
              <td className="px-3 py-2">
                {r.start_date}
                {r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ""}
              </td>
              <td className="px-3 py-2 text-right">{r.days}</td>
              <td className="px-3 py-2 text-xs text-slate-600 max-w-[200px] truncate" title={r.reason ?? ""}>
                {r.reason ?? "-"}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => decide(r.id, "approved")}
                  className="text-xs bg-slate-900 text-white rounded-md px-2 py-1 mr-2"
                >
                  승인
                </button>
                <button
                  onClick={() => decide(r.id, "rejected")}
                  disabled={!canReject}
                  title={canReject ? undefined : "반려는 관리자만 할 수 있습니다."}
                  className="text-xs border rounded-md px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  반려
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                대기중인 신청이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AttendancePage() {
  const session = useSiteSession();
  const [view, setView] = useState<"manage" | "mine">("manage");
  const [tab, setTab] = useState<"request" | "history" | "balance" | "detail" | "approval" | "roster">("request");
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [myBalance, setMyBalance] = useState<LeaveBalance | null>(null);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);

  const isAdmin = session.isAdmin;
  const isModifier = session.isModifier;
  const canApprove = isAdmin || isModifier; // 승인관리 화면 접근 (승인은 수정권한 이상, 반려는 관리자만)
  const hasWorker = session.workerId != null;
  // 승인권한(관리자/수정권한)이 있는 계정도 근로자명부와 연결돼 있으면 "내 근태"에서 본인 근태를 신청할 수 있다.
  const showViewToggle = canApprove && hasWorker;

  async function refresh() {
    if (canApprove) {
      const reqs = await apiGet<LeaveRequest[]>("/api/leave-request");
      setAllRequests(reqs);
      if (isAdmin) {
        const balances = await apiGet<LeaveBalance[]>("/api/leave-balance");
        setAllBalances(balances);
      }
    }
    if (hasWorker) {
      const [reqs, balances] = await Promise.all([
        apiGet<LeaveRequest[]>("/api/leave-request?mine=1"),
        apiGet<LeaveBalance[]>("/api/leave-balance?mine=1"),
      ]);
      setMyRequests(reqs);
      setMyBalance(balances[0] ?? null);
    }
  }

  useEffect(() => {
    if (!session.checked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    if (canApprove) {
      setView("manage");
      setTab("approval");
    } else if (hasWorker) {
      setView("mine");
      setTab("request");
      markLeaveSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.checked, isAdmin, isModifier, hasWorker]);

  const pendingForAdmin = useMemo(() => allRequests.filter((r) => r.status === "pending"), [allRequests]);

  if (!session.checked) {
    return <p className="text-sm text-slate-400">확인 중...</p>;
  }

  if (!canApprove && session.isForeignWorker) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">근태관리</h1>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
          외국인 근로자는 근태관리를 직접 이용할 수 없습니다. 조퇴·대체휴무·지각 등은 관리자가 일일
          출근부에서 직접 입력·관리합니다.
          <br />
          <span className="text-xs block mt-1.5">
            Foreign workers cannot use this attendance system directly. Your manager records outings,
            early leaves, and other attendance changes for you. / Người lao động nước ngoài không thể tự
            sử dụng hệ thống này. Quản lý sẽ ghi nhận thông tin chấm công thay cho bạn.
          </span>
        </p>
      </div>
    );
  }

  if (!canApprove && !hasWorker) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">근태관리</h1>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
          이 계정은 근로자명부와 연결되어 있지 않아 근태 신청·연차현황을 볼 수 없습니다. 관리자에게
          개인계정 연동을 요청해주세요. (시스템관리 → 근로자명부에서 발급)
        </p>
      </div>
    );
  }

  const manageTabs = isAdmin
    ? ([
        { key: "approval", label: "승인 관리" },
        { key: "roster", label: "일일 출근부" },
        { key: "history", label: "신청내역 (전체)" },
        { key: "balance", label: "연차현황 (전체)" },
        { key: "detail", label: "연차현황 상세 (전체)" },
      ] as const)
    : ([
        { key: "approval", label: "승인 관리" },
        { key: "history", label: "신청내역 (전체)" },
      ] as const);
  const mineTabs = [
    { key: "request", label: "근태 신청" },
    { key: "history", label: "신청내역" },
    { key: "balance", label: "연차현황" },
    { key: "detail", label: "연차현황 상세" },
  ] as const;

  // 승인권한 자체가 없으면 "내 근태"만 있으므로 전환 버튼 없이 바로 본인 탭을 보여준다.
  const activeView = canApprove ? view : "mine";
  const tabs = activeView === "manage" ? manageTabs : mineTabs;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">근태관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAdmin
            ? "직원들의 근태 신청을 승인·반려하고, 연차현황을 관리합니다."
            : canApprove
            ? "직원들의 근태 신청을 승인하고, 본인 근태도 신청할 수 있습니다."
            : "연차·반차·외출·조퇴를 신청하고, 본인 연차현황을 확인합니다."}
        </p>
      </div>

      {showViewToggle && (
        <div className="inline-flex bg-slate-100 rounded-lg p-1 gap-0.5 w-fit">
          {(
            [
              { key: "manage", label: "관리 업무" },
              { key: "mine", label: "내 근태" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setView(v.key);
                setTab(v.key === "manage" ? "approval" : "request");
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${
                activeView === v.key ? "bg-slate-900 text-white" : "text-slate-500"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b flex-wrap">
        {tabs.map((t) => (
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

      {activeView === "mine" && tab === "request" && (
        <RequestForm
          myBalance={myBalance}
          approvedRequests={myRequests.filter((r) => r.status === "approved")}
          onCreated={refresh}
        />
      )}
      {activeView === "mine" && tab === "history" && (
        <RequestList rows={myRequests} showWorkerName={false} canCancel onChanged={refresh} />
      )}
      {activeView === "mine" && tab === "balance" && myBalance && <BalanceCard balance={myBalance} />}
      {activeView === "mine" && tab === "detail" && myBalance && <MonthlyDetailCard balance={myBalance} />}

      {activeView === "manage" && tab === "approval" && (
        <AdminApprovalTable rows={pendingForAdmin} onChanged={refresh} canReject={isAdmin} />
      )}
      {activeView === "manage" && isAdmin && tab === "roster" && <DailyRosterTab />}
      {activeView === "manage" && tab === "history" && (
        <RequestList rows={allRequests} showWorkerName canCancel={false} onChanged={refresh} />
      )}
      {activeView === "manage" && isAdmin && tab === "balance" && (
        <AdminBalanceTable rows={allBalances} onSaved={refresh} />
      )}
      {activeView === "manage" && isAdmin && tab === "detail" && (
        <AdminMonthlyDetailTable rows={allBalances} year={allBalances[0]?.year ?? new Date().getFullYear()} />
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="border rounded-md px-4 py-1.5 text-sm font-medium bg-white"
        >
          ↑ 맨 위로
        </button>
      </div>
    </div>
  );
}
