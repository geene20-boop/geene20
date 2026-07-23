"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { PackingEntry, PackingEntryType, PackingItem, Worker } from "@/lib/types";
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

type FormState = {
  date: string;
  type: PackingEntryType;
  productKey: string;
  qty: string;
  bagMatQty: string;
  topsheetKey: string;
  topsheetQty: string;
  wrapKey: string;
  wrapQty: string;
  auxUseKey: string;
  auxUseQty: string;
  worker: string;
};

function emptyForm(): FormState {
  return {
    date: today(),
    type: "pack",
    productKey: "",
    qty: "",
    bagMatQty: "",
    topsheetKey: "",
    topsheetQty: "",
    wrapKey: "",
    wrapQty: "",
    auxUseKey: "",
    auxUseQty: "",
    worker: "",
  };
}

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

export default function PackingEntryPage() {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [entries, setEntries] = useState<PackingEntry[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(daysAgo(30));
  const [rangeTo, setRangeTo] = useState(today());
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
  async function loadEntries(from?: string, to?: string) {
    setEntries(await apiGet<PackingEntry[]>(`/api/packing-entry?from=${from ?? rangeFrom}&to=${to ?? rangeTo}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
    loadEntries();
    admin.refresh();
    apiGet<Worker[]>("/api/worker").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products = useMemo(() => items.filter((i) => i.kind === "product"), [items]);
  const bagmatItems = useMemo(() => items.filter((i) => i.kind === "bagmat"), [items]);
  const auxItems = useMemo(() => items.filter((i) => i.kind === "aux"), [items]);
  const itemByKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const selectedProduct = form.productKey ? itemByKey.get(form.productKey) : undefined;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectProduct(key: string) {
    const item = itemByKey.get(key);
    setForm((f) => ({
      ...f,
      productKey: key,
      bagMatQty: item?.bag_mat_key ? f.qty : "",
    }));
  }

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
      const payload = {
        entered_by: enteredBy,
        date: form.date,
        type: form.type,
        productKey: form.productKey,
        qty: n(form.qty),
        unit: selectedProduct?.unit ?? null,
        bagMatKey: form.type === "pack" ? selectedProduct?.bag_mat_key ?? null : null,
        bagMatQty: form.type === "pack" ? n(form.bagMatQty) : null,
        topsheetKey: form.type === "pack" ? form.topsheetKey || null : null,
        topsheetQty: form.type === "pack" ? n(form.topsheetQty) : null,
        wrapKey: form.type === "pack" ? form.wrapKey || null : null,
        wrapQty: form.type === "pack" ? n(form.wrapQty) : null,
        auxUseKey: form.type === "pack" ? form.auxUseKey || null : null,
        auxUseQty: form.type === "pack" ? n(form.auxUseQty) : null,
        worker: form.worker || null,
      };
      if (editingId) {
        await apiPut(`/api/packing-entry/${editingId}`, payload);
        setMessage("수정되었습니다.");
      } else {
        await apiPost("/api/packing-entry", payload);
        setMessage("등록되었습니다.");
      }
      setForm(emptyForm());
      setEditingId(null);
      await Promise.all([loadItems(), loadEntries()]);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: PackingEntry) {
    setEditingId(row.id);
    setForm({
      date: row.date,
      type: row.type,
      productKey: row.product_key,
      qty: String(row.qty),
      bagMatQty: row.bag_mat_qty != null ? String(row.bag_mat_qty) : "",
      topsheetKey: row.topsheet_key ?? "",
      topsheetQty: row.topsheet_qty != null ? String(row.topsheet_qty) : "",
      wrapKey: row.wrap_key ?? "",
      wrapQty: row.wrap_qty != null ? String(row.wrap_qty) : "",
      auxUseKey: row.aux_use_key ?? "",
      auxUseQty: row.aux_use_qty != null ? String(row.aux_use_qty) : "",
      worker: row.worker ?? "",
    });
  }

  async function removeEntry(id: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 입력 내역을 삭제할까요? 재고가 원래대로 복원됩니다.")) return;
    await apiDelete(`/api/packing-entry/${id}`, { entered_by: enteredBy });
    await Promise.all([loadItems(), loadEntries()]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">생산(포장) / 출하 입력</h1>
        <p className="text-sm text-slate-500 mt-1">
          제품을 포장하면 재고가 늘고 포장지·부자재가 자동 차감되며, 출하하면 제품 재고만 줄어듭니다.
        </p>
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
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">구분</span>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value as PackingEntryType)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="pack">생산(포장)</option>
              <option value="ship">출하</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">작업자</span>
            <select
              value={form.worker}
              onChange={(e) => set("worker", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="">선택</option>
              {form.worker && !workers.some((w) => w.name === form.worker) && (
                <option value={form.worker}>{form.worker}</option>
              )}
              {workers.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">제품</span>
            <select
              value={form.productKey}
              onChange={(e) => selectProduct(e.target.value)}
              className="border rounded-md px-2 py-1.5"
              required
            >
              <option value="">선택</option>
              {products.map((p) => (
                <option key={p.key} value={p.key}>
                  {itemLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">수량{selectedProduct?.unit ? ` (${selectedProduct.unit})` : ""}</span>
            <input
              type="number"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              className="border rounded-md px-2 py-1.5"
              required
            />
          </label>
          {form.type === "pack" && selectedProduct?.bag_mat_key && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">포장지 사용량</span>
              <input
                type="number"
                value={form.bagMatQty}
                onChange={(e) => set("bagMatQty", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
          )}
        </div>

        {form.type === "pack" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t pt-3">
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-slate-600">탑시트 품목</span>
                <select
                  value={form.topsheetKey}
                  onChange={(e) => set("topsheetKey", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                >
                  <option value="">선택안함</option>
                  {bagmatItems
                    .concat(auxItems)
                    .filter((i) => i.sub?.includes("탑시트"))
                    .map((i) => (
                      <option key={i.key} value={i.key}>
                        {itemLabel(i)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm w-24">
                <span className="text-slate-600">수량</span>
                <input
                  type="number"
                  value={form.topsheetQty}
                  onChange={(e) => set("topsheetQty", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-slate-600">랩(스트레치필름)</span>
                <select
                  value={form.wrapKey}
                  onChange={(e) => set("wrapKey", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                >
                  <option value="">선택안함</option>
                  {auxItems
                    .filter((i) => i.sub?.includes("스트레치필름"))
                    .map((i) => (
                      <option key={i.key} value={i.key}>
                        {itemLabel(i)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm w-24">
                <span className="text-slate-600">수량</span>
                <input
                  type="number"
                  value={form.wrapQty}
                  onChange={(e) => set("wrapQty", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-slate-600">기타 부자재</span>
                <select
                  value={form.auxUseKey}
                  onChange={(e) => set("auxUseKey", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                >
                  <option value="">선택안함</option>
                  {auxItems
                    .filter((i) => !i.sub?.includes("탑시트") && !i.sub?.includes("스트레치필름"))
                    .map((i) => (
                      <option key={i.key} value={i.key}>
                        {itemLabel(i)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm w-24">
                <span className="text-slate-600">수량</span>
                <input
                  type="number"
                  value={form.auxUseQty}
                  onChange={(e) => set("auxUseQty", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                />
              </label>
            </div>
          </div>
        )}

        {message && <p className="text-sm text-slate-600">{message}</p>}
        <div className="flex items-center gap-2 justify-end">
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
              }}
              className="border rounded-md px-3 py-1.5 text-sm"
            >
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : editingId ? "수정 저장" : "등록"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">입력내역</h2>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">시작일</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">종료일</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => loadEntries()}
              className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-xs font-medium"
            >
              조회
            </button>
          </div>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">구분</th>
              <th className="text-left px-3 py-2">제품</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-left px-3 py-2">입력자</th>
              {admin.loggedIn && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => {
              const item = itemByKey.get(row.product_key);
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.type === "pack" ? "생산" : "출하"}</td>
                  <td className="px-3 py-2">{item ? itemLabel(item) : row.product_key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qty}
                    {row.unit ?? ""}
                  </td>
                  <td className="px-3 py-2">{row.worker ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{row.entered_by ?? "-"}</td>
                  {admin.loggedIn && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(row)}
                          className="text-xs border rounded-md px-2 py-1 bg-white"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => removeEntry(row.id)}
                          className="text-xs border rounded-md px-2 py-1 bg-white text-red-600"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  해당 기간에 입력 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!admin.loggedIn && (
        <p className="text-xs text-slate-400">
          수정·삭제는 관리자만 가능합니다.{" "}
          <button onClick={() => setShowAdminModal(true)} className="underline">
            관리자 로그인
          </button>
        </p>
      )}
      {showAdminModal && (
        <AdminLoginModal
          onClose={() => setShowAdminModal(false)}
          onSuccess={() => {
            admin.refresh();
            session.refresh();
            setShowAdminModal(false);
          }}
        />
      )}
    </div>
  );
}
