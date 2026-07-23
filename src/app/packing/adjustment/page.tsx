"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { PackingAdjustment, PackingItem } from "@/lib/types";
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

function AdjustmentForm() {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [rows, setRows] = useState<PackingAdjustment[]>([]);
  const [date, setDate] = useState(today());
  const [key, setKey] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
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
    setRows(await apiGet<PackingAdjustment[]>(`/api/packing-adjustment?from=${daysAgo(30)}&to=${today()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
    loadRows();
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
      await apiPost("/api/packing-adjustment", {
        entered_by: enteredBy,
        date,
        key,
        kind: selected?.kind ?? null,
        qty: Number(qty),
        reason: reason || null,
      });
      setMessage("재고 조정이 반영되었습니다.");
      setKey("");
      setQty("");
      setReason("");
      await Promise.all([loadItems(), loadRows()]);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">전일재고 조정</h1>
        <p className="text-sm text-slate-500 mt-1">
          실사 결과와 맞지 않을 때 수동으로 증감(+/-)시킵니다. 관리자 전용 기능입니다.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
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
                  {itemLabel(i)} (현재 {i.stock}
                  {i.unit ?? ""})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">증감값 (+늘림 / -줄임)</span>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="border rounded-md px-2 py-1.5" required />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">사유</span>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="border rounded-md px-2 py-1.5" placeholder="예: 실사 결과 반영" />
        </label>
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
            {saving ? "저장 중..." : "조정 반영"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">최근 30일 조정내역</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">증감</th>
              <th className="text-left px-3 py-2">사유</th>
              <th className="text-left px-3 py-2">입력자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = itemByKey.get(row.key);
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{item ? itemLabel(item) : row.key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qty > 0 ? "+" : ""}
                    {row.qty}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.reason ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{row.entered_by ?? "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  최근 30일간 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PackingAdjustmentPage() {
  const admin = useAdminSession();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!admin.checked) {
    return <p className="text-sm text-slate-400">확인 중...</p>;
  }

  if (!admin.loggedIn) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <div>
          <h1 className="text-xl font-bold">전일재고 조정</h1>
          <p className="text-sm text-slate-500 mt-1">이 화면은 관리자 로그인이 필요합니다.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
          관리자 로그인
        </button>
        {showModal && (
          <AdminLoginModal
            onClose={() => setShowModal(false)}
            onSuccess={() => {
              admin.setLoggedIn(true);
              setShowModal(false);
            }}
          />
        )}
      </div>
    );
  }

  return <AdjustmentForm />;
}
