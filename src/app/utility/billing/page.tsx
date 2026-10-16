"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { MonthlyUtility } from "@/lib/types";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AmountHint from "@/components/AmountHint";
import { useSiteSession } from "@/lib/useSiteSession";

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const fmt = (v: number | null | undefined, digits = 0): string =>
  v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

type MonthlyForm = {
  month: string;
  elec1_kwh: string;
  elec1_won: string;
  elec2_kwh: string;
  elec2_won: string;
  lng_dryer_m3: string;
  lng_dryer_won: string;
  lng_rto_m3: string;
  lng_rto_won: string;
  diesel_liter: string;
  diesel_won: string;
  production_ton: string;
  note: string;
};
const emptyMonthlyForm = (): MonthlyForm => ({
  month: thisMonth(),
  elec1_kwh: "",
  elec1_won: "",
  elec2_kwh: "",
  elec2_won: "",
  lng_dryer_m3: "",
  lng_dryer_won: "",
  lng_rto_m3: "",
  lng_rto_won: "",
  diesel_liter: "",
  diesel_won: "",
  production_ton: "",
  note: "",
});

export default function UtilityBillingPage() {
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [mForm, setMForm] = useState<MonthlyForm>(emptyMonthlyForm());
  const [savingMonth, setSavingMonth] = useState(false);
  const [monthMsg, setMonthMsg] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const session = useSiteSession();
  const canManageMonthly = admin.loggedIn || session.isModifier;
  const [refreshKey, setRefreshKey] = useState(0);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  useEffect(() => {
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMF = <K extends keyof MonthlyForm>(k: K, v: MonthlyForm[K]) =>
    setMForm((f) => ({ ...f, [k]: v }));

  const lngDryerWonNum = Number(mForm.lng_dryer_won) || 0;
  const lngRtoWonNum = Number(mForm.lng_rto_won) || 0;
  const lngWonTotal = mForm.lng_dryer_won.trim() || mForm.lng_rto_won.trim() ? lngDryerWonNum + lngRtoWonNum : null;
  const lngM3DryerNum = Number(mForm.lng_dryer_m3) || 0;
  const lngM3RtoNum = Number(mForm.lng_rto_m3) || 0;
  const lngM3Total = mForm.lng_dryer_m3.trim() || mForm.lng_rto_m3.trim() ? lngM3DryerNum + lngM3RtoNum : null;

  async function saveMonth(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSavingMonth(true);
    setMonthMsg(null);
    try {
      await apiPost("/api/monthly-utility", { ...mForm, entered_by: enteredBy.trim() });
      setMonthMsg("저장되었습니다.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMonthMsg(`오류: ${(err as Error).message}`);
    } finally {
      setSavingMonth(false);
    }
  }

  function editMonth(m: MonthlyUtility) {
    setMForm({
      month: m.month,
      elec1_kwh: m.elec1_kwh?.toString() ?? "",
      elec1_won: m.elec1_won?.toString() ?? "",
      elec2_kwh: m.elec2_kwh?.toString() ?? "",
      elec2_won: m.elec2_won?.toString() ?? "",
      lng_dryer_m3: m.lng_dryer_m3?.toString() ?? "",
      lng_dryer_won: m.lng_dryer_won?.toString() ?? "",
      lng_rto_m3: m.lng_rto_m3?.toString() ?? "",
      lng_rto_won: m.lng_rto_won?.toString() ?? "",
      diesel_liter: m.diesel_liter?.toString() ?? "",
      diesel_won: m.diesel_won?.toString() ?? "",
      production_ton: m.production_ton?.toString() ?? "",
      note: m.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!enteredBy.trim()) {
      setNameError(true);
      e.target.value = "";
      return;
    }
    setImportMsg("업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entered_by", enteredBy.trim());
    try {
      const res = await fetch("/api/monthly-utility/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      if (json.structureError) {
        setImportMsg(`형식 오류: ${json.structureError}`);
      } else {
        setImportMsg(`반영 완료: ${json.inserted}건 처리, ${json.skipped}건 건너뜀`);
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setImportMsg(`오류: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">실청구금액 입력</h1>
        <p className="text-sm text-slate-500 mt-1">
          전력·LNG(건조로/RTO)·경유 청구서 금액을 월별로 입력합니다. 여기서 입력한 LNG 금액·사용량
          합계는 <a href="/utility" className="underline">월별 유틸리티 통합 시트</a>에 자동으로 반영됩니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">월별 금액·경유 입력 (청구서 기준)</h2>
          <div className="flex items-center gap-2">
            <a href="/api/utility-template" className="text-xs border border-slate-300 rounded-md px-3 py-1.5">
              엑셀 양식 받기
            </a>
            {admin.loggedIn ? (
              <label className="text-xs border border-slate-300 rounded-md px-3 py-1.5 cursor-pointer">
                엑셀 업로드
                <input type="file" accept=".xlsx,.xls" onChange={onImport} className="hidden" />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdminModal(true)}
                className="text-xs border border-slate-300 rounded-md px-3 py-1.5 text-slate-400"
              >
                엑셀 업로드 (관리자 전용)
              </button>
            )}
          </div>
        </div>
        {importMsg && <p className="text-xs text-slate-600">{importMsg}</p>}
        {!canManageMonthly && (
          <div className="flex items-center justify-between gap-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
            <span>
              금액·경유 등 재무 데이터는 관리자 또는 수정 권한 계정만 입력/수정할 수 있습니다.
              조회는 누구나 볼 수 있습니다.
            </span>
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="underline whitespace-nowrap"
            >
              관리자 로그인
            </button>
          </div>
        )}
        {showAdminModal && (
          <AdminLoginModal
            onClose={() => setShowAdminModal(false)}
            onSuccess={() => {
              admin.setLoggedIn(true);
              session.refresh();
              setShowAdminModal(false);
            }}
          />
        )}
        <form
          onSubmit={saveMonth}
          className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${!canManageMonthly ? "opacity-50 pointer-events-none" : ""}`}
        >
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">월</span>
            <input type="month" value={mForm.month} onChange={(e) => setMF("month", e.target.value)} className="border rounded-md px-2 py-1.5" required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">1공장 사용량(kWh)</span>
            <input type="number" step="any" value={mForm.elec1_kwh} onChange={(e) => setMF("elec1_kwh", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">1공장 금액(원)</span>
            <input type="number" step="any" value={mForm.elec1_won} onChange={(e) => setMF("elec1_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.elec1_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">2공장 사용량(kWh)</span>
            <input type="number" step="any" value={mForm.elec2_kwh} onChange={(e) => setMF("elec2_kwh", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">2공장 금액(원)</span>
            <input type="number" step="any" value={mForm.elec2_won} onChange={(e) => setMF("elec2_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.elec2_won} />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">건조로 LNG 사용량(㎥)</span>
            <input type="number" step="any" value={mForm.lng_dryer_m3} onChange={(e) => setMF("lng_dryer_m3", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">건조로 LNG 금액(원)</span>
            <input type="number" step="any" value={mForm.lng_dryer_won} onChange={(e) => setMF("lng_dryer_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.lng_dryer_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">RTO LNG 사용량(㎥)</span>
            <input type="number" step="any" value={mForm.lng_rto_m3} onChange={(e) => setMF("lng_rto_m3", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">RTO LNG 금액(원)</span>
            <input type="number" step="any" value={mForm.lng_rto_won} onChange={(e) => setMF("lng_rto_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.lng_rto_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">LNG 합계 사용량(㎥)</span>
            <input type="text" readOnly value={lngM3Total != null ? fmt(lngM3Total) : ""} placeholder="자동 계산" className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">LNG 합계 금액(원)</span>
            <input type="text" readOnly value={lngWonTotal != null ? fmt(lngWonTotal) : ""} placeholder="자동 계산" className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500" />
            {lngWonTotal != null && <AmountHint value={String(lngWonTotal)} />}
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">경유 사용량(ℓ)</span>
            <input type="number" step="any" value={mForm.diesel_liter} onChange={(e) => setMF("diesel_liter", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">경유 금액(원)</span>
            <input type="number" step="any" value={mForm.diesel_won} onChange={(e) => setMF("diesel_won", e.target.value)} className="border rounded-md px-2 py-1.5" />
            <AmountHint value={mForm.diesel_won} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">생산량 보정(ton)</span>
            <input type="number" step="any" value={mForm.production_ton} onChange={(e) => setMF("production_ton", e.target.value)} placeholder="비우면 일별합산" className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="text-slate-600">비고</span>
            <input type="text" value={mForm.note} onChange={(e) => setMF("note", e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            {mForm.month && (
              <button
                type="button"
                onClick={() => {
                  setMForm(emptyMonthlyForm());
                  setMonthMsg(null);
                }}
                className="border rounded-md px-4 py-2 text-sm font-medium"
              >
                취소
              </button>
            )}
            <button type="submit" disabled={savingMonth} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
              {savingMonth ? "저장 중..." : "월별 저장"}
            </button>
            {monthMsg && <span className="text-sm text-slate-600">{monthMsg}</span>}
          </div>
        </form>

        {/* 저장된 월별 값 목록 (수정은 관리자·수정 권한, 승인/승인해제는 관리자만) */}
        <MonthlyList
          onEdit={editMonth}
          refreshKey={refreshKey}
          isAdmin={admin.loggedIn}
          isModifier={session.isModifier}
          enteredBy={enteredBy}
          onNameError={() => setNameError(true)}
        />
      </div>
    </div>
  );
}

function MonthlyList({
  onEdit,
  refreshKey,
  isAdmin,
  isModifier,
  enteredBy,
  onNameError,
}: {
  onEdit: (m: MonthlyUtility) => void;
  refreshKey: number;
  isAdmin: boolean;
  isModifier: boolean;
  enteredBy: string;
  onNameError: () => void;
}) {
  const [rows, setRows] = useState<MonthlyUtility[]>([]);
  const load = useCallback(async () => {
    setRows(await apiGet<MonthlyUtility[]>("/api/monthly-utility"));
  }, []);
  useEffect(() => {
    let cancelled = false;
    apiGet<MonthlyUtility[]>("/api/monthly-utility").then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function canEditRow(m: MonthlyUtility) {
    return !m.locked && (isAdmin || isModifier);
  }
  function canDeleteRow(m: MonthlyUtility) {
    if (m.locked) return false;
    if (isAdmin) return true;
    return isModifier && !m.approved_at;
  }
  async function remove(m: MonthlyUtility) {
    if (!enteredBy.trim()) {
      onNameError();
      return;
    }
    if (!confirm(`${m.month} 월 데이터를 삭제할까요?`)) return;
    await apiDelete(`/api/monthly-utility/${m.month}`, { entered_by: enteredBy });
    await load();
  }
  async function toggleLock(m: MonthlyUtility) {
    if (!enteredBy.trim()) {
      onNameError();
      return;
    }
    await apiPut(`/api/monthly-utility/${m.month}/lock`, { entered_by: enteredBy, locked: !m.locked });
    await load();
  }

  if (rows.length === 0) return null;
  const canManage = isAdmin || isModifier;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full tabular-nums">
        <thead className="text-slate-500">
          <tr className="border-b">
            <th className="text-left px-2 py-1.5">월</th>
            <th className="text-right px-2 py-1.5">전력금액</th>
            <th className="text-right px-2 py-1.5">건조로 LNG금액</th>
            <th className="text-right px-2 py-1.5">RTO LNG금액</th>
            <th className="text-right px-2 py-1.5">경유(ℓ)</th>
            <th className="text-right px-2 py-1.5">경유금액</th>
            <th className="text-left px-2 py-1.5">입력자/수정자</th>
            <th className="text-left px-2 py-1.5">상태</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month} className="border-b border-slate-100">
              <td className="text-left px-2 py-1.5 font-medium">{m.month}</td>
              <td className="text-right px-2 py-1.5">{fmt((m.elec1_won ?? 0) + (m.elec2_won ?? 0))}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.lng_dryer_won)}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.lng_rto_won)}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.diesel_liter)}</td>
              <td className="text-right px-2 py-1.5">{fmt(m.diesel_won)}</td>
              <td className="text-left px-2 py-1.5 text-slate-500 whitespace-nowrap">
                {m.entered_by ?? "-"}
                {m.updated_by && m.updated_by !== m.entered_by ? ` → ${m.updated_by}` : ""}
              </td>
              <td className="text-left px-2 py-1.5">
                {m.locked ? (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    승인됨
                  </span>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="text-right px-2 py-1.5">
                {!canManage ? (
                  <span className="text-slate-300">-</span>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    {canEditRow(m) && (
                      <button onClick={() => onEdit(m)} className="text-sky-600 hover:underline">수정</button>
                    )}
                    {canDeleteRow(m) && (
                      <button onClick={() => remove(m)} className="text-red-600 hover:underline">삭제</button>
                    )}
                    {isAdmin && (
                      <button onClick={() => toggleLock(m)} className="text-slate-600 hover:underline">
                        {m.locked ? "승인해제" : "승인"}
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
