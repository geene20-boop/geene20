"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { PackingItem, PackingKind } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { KIND_LABELS, itemLabel } from "@/lib/packingClient";
import { useSiteSession } from "@/lib/useSiteSession";

type NewItemForm = {
  key: string;
  kind: PackingKind;
  category: string;
  sub: string;
  unit: string;
  bagKg: string;
  bagMatKey: string;
  initialStock: string;
};

function emptyForm(): NewItemForm {
  return { key: "", kind: "product", category: "", sub: "", unit: "", bagKg: "", bagMatKey: "", initialStock: "" };
}

export default function PackingItemsPage() {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [form, setForm] = useState<NewItemForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: "", sub: "", unit: "", bagKg: "", stock: "" });
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await apiPost("/api/packing-item", {
        entered_by: enteredBy,
        key: form.key,
        kind: form.kind,
        category: form.category || null,
        sub: form.sub || null,
        unit: form.unit || null,
        bagKg: form.bagKg ? Number(form.bagKg) : null,
        bagMatKey: form.bagMatKey || null,
        initialStock: form.initialStock ? Number(form.initialStock) : 0,
      });
      setMessage("품목이 추가되었습니다.");
      setForm(emptyForm());
      await loadItems();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: PackingItem) {
    setEditKey(item.key);
    setEditForm({
      category: item.category ?? "",
      sub: item.sub ?? "",
      unit: item.unit ?? "",
      bagKg: item.bag_kg != null ? String(item.bag_kg) : "",
      stock: String(item.stock),
    });
  }

  async function saveEdit(key: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPut(`/api/packing-item/${key}`, {
        entered_by: enteredBy,
        category: editForm.category,
        sub: editForm.sub,
        unit: editForm.unit,
        bagKg: editForm.bagKg ? Number(editForm.bagKg) : undefined,
        stock: Number(editForm.stock),
      });
      setEditKey(null);
      await loadItems();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function removeItem(key: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 품목을 삭제할까요? 재고가 0인 품목만 삭제할 수 있습니다.")) return;
    try {
      await apiDelete(`/api/packing-item/${key}`, { entered_by: enteredBy });
      await loadItems();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function toggleLock(item: PackingItem) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPut(`/api/packing-item/${item.key}/lock`, { entered_by: enteredBy, locked: !item.locked });
      await loadItems();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  const canManage = admin.loggedIn || session.isModifier;
  function canEdit(item: PackingItem) {
    return !item.locked && (admin.loggedIn || session.isModifier);
  }
  function canDelete(item: PackingItem) {
    if (item.locked) return false;
    if (admin.loggedIn) return true;
    return session.isModifier && !item.approved_at;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">품목관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          제품/포장지/부자재 품목을 추가합니다. 수정은 관리자 및 수정 권한 계정이 가능하며, 관리자가
          승인한 품목은 승인해제 전까지 아무도 수정·삭제할 수 없습니다.
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
        <h2 className="text-sm font-semibold text-slate-700">새 품목 추가</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">품목 키 (영문/숫자, 고유값)</span>
            <input
              type="text"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">구분</span>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PackingKind }))}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="product">제품</option>
              <option value="bagmat">포장지</option>
              <option value="aux">부자재</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">대분류</span>
            <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">품목명</span>
            <input type="text" value={form.sub} onChange={(e) => setForm((f) => ({ ...f, sub: e.target.value }))} className="border rounded-md px-2 py-1.5" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">단위</span>
            <input type="text" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="border rounded-md px-2 py-1.5" placeholder="포/톤/개" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">초기 재고</span>
            <input type="number" value={form.initialStock} onChange={(e) => setForm((f) => ({ ...f, initialStock: e.target.value }))} className="border rounded-md px-2 py-1.5" />
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
            {saving ? "저장 중..." : "추가"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">전체 품목</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">구분</th>
              <th className="text-left px-3 py-2">대분류</th>
              <th className="text-left px-3 py-2">품목명</th>
              <th className="text-left px-3 py-2">단위</th>
              <th className="text-right px-3 py-2">재고</th>
              <th className="text-left px-3 py-2">상태</th>
              {canManage && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-t">
                <td className="px-3 py-2">{KIND_LABELS[item.kind]}</td>
                {editKey === item.key ? (
                  <>
                    <td className="px-3 py-2">
                      <input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} className="border rounded-md px-2 py-1 w-24" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editForm.sub} onChange={(e) => setEditForm((f) => ({ ...f, sub: e.target.value }))} className="border rounded-md px-2 py-1 w-32" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} className="border rounded-md px-2 py-1 w-16" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={editForm.stock}
                        onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value }))}
                        className="border rounded-md px-2 py-1 w-20 text-right"
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{item.category ?? "-"}</td>
                    <td className="px-3 py-2">{item.sub ?? itemLabel(item)}</td>
                    <td className="px-3 py-2">{item.unit ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.stock}</td>
                  </>
                )}
                <td className="px-3 py-2">
                  {item.locked ? (
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      승인됨
                    </span>
                  ) : item.approved_at ? (
                    <span className="text-xs text-slate-400">승인해제됨</span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      {editKey === item.key ? (
                        <>
                          <button onClick={() => saveEdit(item.key)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            저장
                          </button>
                          <button onClick={() => setEditKey(null)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit(item) && (
                            <button onClick={() => startEdit(item)} className="text-xs border rounded-md px-2 py-1 bg-white">
                              수정
                            </button>
                          )}
                          {canDelete(item) && (
                            <button onClick={() => removeItem(item.key)} className="text-xs border rounded-md px-2 py-1 bg-white text-red-600">
                              삭제
                            </button>
                          )}
                        </>
                      )}
                      {admin.loggedIn && (
                        <button onClick={() => toggleLock(item)} className="text-xs border rounded-md px-2 py-1 bg-white">
                          {item.locked ? "승인해제" : "승인"}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  등록된 품목이 없습니다.
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
