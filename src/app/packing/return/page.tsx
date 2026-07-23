"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { PackingItem, PackingReturn, Worker } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { itemLabel } from "@/lib/packingClient";
import { useSiteSession } from "@/lib/useSiteSession";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function PackingReturnPage() {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [rows, setRows] = useState<PackingReturn[]>([]);
  const [date, setDate] = useState(today());
  const [key, setKey] = useState("");
  const [qty, setQty] = useState("");
  const [worker, setWorker] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const session = useSiteSession();

  useEffect(() => {
    if (session.loggedIn && session.displayName) {
       
      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function loadItems() {
    setItems(await apiGet<PackingItem[]>("/api/packing-item"));
  }
  async function loadRows() {
    setRows(await apiGet<PackingReturn[]>(`/api/packing-return?from=${daysAgo(30)}&to=${today()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
    loadRows();
    admin.refresh();
    apiGet<Worker[]>("/api/worker").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemByKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const selected = key ? itemByKey.get(key) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/packing-return", {
        entered_by: enteredBy,
        date,
        key,
        kind: selected?.kind ?? null,
        qty: Number(qty),
        worker: worker || null,
      });
      setMessage("반품 등록되었습니다.");
      setKey("");
      setQty("");
      await Promise.all([loadItems(), loadRows()]);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 반품 내역을 삭제할까요? 늘었던 재고가 다시 줄어듭니다.")) return;
    await apiDelete(`/api/packing-return/${id}`, { entered_by: enteredBy });
    await Promise.all([loadItems(), loadRows()]);
  }

  async function toggleLock(row: PackingReturn) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    await apiPut(`/api/packing-return/${row.id}/lock`, { entered_by: enteredBy, locked: !row.locked });
    await loadRows();
  }

  const canManage = admin.loggedIn || session.isModifier;
  function canDeleteRow(row: PackingReturn) {
    if (row.locked) return false;
    if (admin.loggedIn) return true;
    return session.isModifier && !row.approved_at;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">반품 입력</h1>
        <p className="text-sm text-slate-500 mt-1">제품/부자재/포장지가 반품되어 돌아오면 재고가 다시 늘어납니다.</p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 입력·수정은 editor 권한이 필요합니다.
        </div>
      )}

      <form
        onSubmit={submit}
        className={`flex flex-col gap-4 bg-white rounded-xl border p-5 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">품목</span>
            <select value={key} onChange={(e) => setKey(e.target.value)} className="border rounded-md px-2 py-1.5" required>
              <option value="">선택</option>
              {items.map((i) => (
                <option key={i.key} value={i.key}>
                  {itemLabel(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">반품수량{selected?.unit ? ` (${selected.unit})` : ""}</span>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="border rounded-md px-2 py-1.5" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">작업자</span>
            <select value={worker} onChange={(e) => setWorker(e.target.value)} className="border rounded-md px-2 py-1.5">
              <option value="">선택</option>
              {worker && !workers.some((w) => w.name === worker) && <option value={worker}>{worker}</option>}
              {workers.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="border rounded-md px-4 py-1.5 text-sm font-medium"
          >
            ↑ 맨 위로
          </button>
          <button type="submit" disabled={saving} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {saving ? "저장 중..." : "등록"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">최근 30일 반품내역</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-left px-3 py-2">입력자</th>
              <th className="text-left px-3 py-2">상태</th>
              {canManage && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = itemByKey.get(row.key);
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{item ? itemLabel(item) : row.key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">+{row.qty}</td>
                  <td className="px-3 py-2">{row.worker ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{row.entered_by ?? "-"}</td>
                  <td className="px-3 py-2">
                    {row.locked ? (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        승인됨
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        {canDeleteRow(row) && (
                          <button onClick={() => remove(row.id)} className="text-xs border rounded-md px-2 py-1 bg-white text-red-600">
                            삭제
                          </button>
                        )}
                        {admin.loggedIn && (
                          <button onClick={() => toggleLock(row)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            {row.locked ? "승인해제" : "승인"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  최근 30일간 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!admin.loggedIn && (
        <p className="text-xs text-slate-400">
          승인/승인해제는 관리자만 가능합니다.{" "}
          <button onClick={() => setShowAdminModal(true)} className="underline">
            관리자 로그인
          </button>
        </p>
      )}
      {showAdminModal && (
        <AdminLoginModal onClose={() => setShowAdminModal(false)} onSuccess={() => { admin.refresh(); session.refresh(); setShowAdminModal(false); }} />
      )}
    </div>
  );
}
