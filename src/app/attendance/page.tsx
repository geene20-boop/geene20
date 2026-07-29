"use client";

import { useEffect, useMemo, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";

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

function RequestForm({ myBalance, onCreated }: { myBalance: LeaveBalance | null; onCreated: () => void }) {
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

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 flex flex-col gap-4">
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
          <p className="text-xs text-slate-500 mt-0.5">{balance.year}년 · 오늘 기준</p>
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
    setImportMsg(
      `완료: 신규 ${data.inserted}건, 갱신 ${data.updated}건${data.skipped ? `, 건너뜀 ${data.skipped}건` : ""}`
    );
    onSaved();
  }

  return (
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
  );
}

function AdminApprovalTable({ rows, onChanged }: { rows: LeaveRequest[]; onChanged: () => void }) {
  async function decide(id: number, status: "approved" | "rejected") {
    await apiPut(`/api/leave-request/${id}`, { status });
    onChanged();
  }

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
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
                <button onClick={() => decide(r.id, "rejected")} className="text-xs border rounded-md px-2 py-1">
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
  const [tab, setTab] = useState<"request" | "history" | "balance" | "approval">("request");
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [myBalance, setMyBalance] = useState<LeaveBalance | null>(null);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);

  const isAdmin = session.isAdmin;
  const hasWorker = session.workerId != null;

  async function refresh() {
    if (isAdmin) {
      const [reqs, balances] = await Promise.all([
        apiGet<LeaveRequest[]>("/api/leave-request"),
        apiGet<LeaveBalance[]>("/api/leave-balance"),
      ]);
      setAllRequests(reqs);
      setAllBalances(balances);
    } else if (hasWorker) {
      const [reqs, balances] = await Promise.all([
        apiGet<LeaveRequest[]>("/api/leave-request"),
        apiGet<LeaveBalance[]>("/api/leave-balance"),
      ]);
      setMyRequests(reqs);
      setMyBalance(balances[0] ?? null);
    }
  }

  useEffect(() => {
    if (!session.checked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    if (isAdmin) setTab("approval");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.checked, isAdmin, hasWorker]);

  const pendingForAdmin = useMemo(() => allRequests.filter((r) => r.status === "pending"), [allRequests]);

  if (!session.checked) {
    return <p className="text-sm text-slate-400">확인 중...</p>;
  }

  if (!isAdmin && !hasWorker) {
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

  const tabs = isAdmin
    ? ([
        { key: "approval", label: "승인 관리" },
        { key: "history", label: "신청내역 (전체)" },
        { key: "balance", label: "연차현황 (전체)" },
      ] as const)
    : ([
        { key: "request", label: "근태 신청" },
        { key: "history", label: "신청내역" },
        { key: "balance", label: "연차현황" },
      ] as const);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">근태관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAdmin
            ? "직원들의 근태 신청을 승인·반려하고, 연차현황을 관리합니다."
            : "연차·반차·외출·조퇴를 신청하고, 본인 연차현황을 확인합니다."}
        </p>
      </div>

      <div className="flex gap-2 border-b">
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

      {!isAdmin && tab === "request" && <RequestForm myBalance={myBalance} onCreated={refresh} />}
      {!isAdmin && tab === "history" && (
        <RequestList rows={myRequests} showWorkerName={false} canCancel onChanged={refresh} />
      )}
      {!isAdmin && tab === "balance" && myBalance && <BalanceCard balance={myBalance} />}

      {isAdmin && tab === "approval" && <AdminApprovalTable rows={pendingForAdmin} onChanged={refresh} />}
      {isAdmin && tab === "history" && (
        <RequestList rows={allRequests} showWorkerName canCancel={false} onChanged={refresh} />
      )}
      {isAdmin && tab === "balance" && <AdminBalanceTable rows={allBalances} onSaved={refresh} />}

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
