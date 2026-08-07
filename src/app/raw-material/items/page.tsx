"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { RawMaterial, RawMaterialForm, RawMaterialSupplier, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { useSiteSession } from "@/lib/useSiteSession";

type NewMaterialForm = {
  key: string;
  name: string;
  form: RawMaterialForm;
  category: string;
  unit: string;
  submitTo: string;
  initialStock: string;
};

function emptyMaterialForm(): NewMaterialForm {
  return { key: "", name: "", form: "solid", category: "", unit: "", submitTo: "", initialStock: "" };
}

export default function RawMaterialItemsPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<RawMaterialSupplier[]>([]);
  const [form, setForm] = useState<NewMaterialForm>(emptyMaterialForm());
  const [supplierForm, setSupplierForm] = useState({ name: "", address: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", unit: "", submitTo: "", stock: "" });
  const [editSupplierId, setEditSupplierId] = useState<number | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState({ name: "", address: "", phone: "" });
  const session = useSiteSession();

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function loadMaterials() {
    setMaterials(await apiGet<RawMaterial[]>("/api/raw-material"));
  }
  async function loadSuppliers() {
    setSuppliers(await apiGet<RawMaterialSupplier[]>("/api/raw-material-supplier"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMaterials();
    loadSuppliers();
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/raw-material", {
        entered_by: enteredBy,
        key: form.key,
        name: form.name,
        form: form.form,
        category: form.category || null,
        unit: form.unit || null,
        submitTo: form.submitTo || null,
        initialStock: form.initialStock ? Number(form.initialStock) : 0,
      });
      setMessage("원재료가 추가되었습니다.");
      setForm(emptyMaterialForm());
      await loadMaterials();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function startEditMaterial(item: RawMaterial) {
    setEditKey(item.key);
    setEditForm({
      name: item.name,
      category: item.category ?? "",
      unit: item.unit ?? "",
      submitTo: item.submit_to ?? "",
      stock: String(item.stock),
    });
  }

  async function saveEditMaterial(key: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPut(`/api/raw-material/${key}`, {
        entered_by: enteredBy,
        name: editForm.name,
        category: editForm.category,
        unit: editForm.unit,
        submitTo: editForm.submitTo,
        stock: Number(editForm.stock),
      });
      setEditKey(null);
      await loadMaterials();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function removeMaterial(key: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 원재료를 삭제할까요? 재고가 0인 원재료만 삭제할 수 있습니다.")) return;
    try {
      await apiDelete(`/api/raw-material/${key}`, { entered_by: enteredBy });
      await loadMaterials();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function toggleLock(item: RawMaterial) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPut(`/api/raw-material/${item.key}/lock`, { entered_by: enteredBy, locked: !item.locked });
      await loadMaterials();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function submitSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPost("/api/raw-material-supplier", {
        entered_by: enteredBy,
        name: supplierForm.name,
        address: supplierForm.address || null,
        phone: supplierForm.phone || null,
      });
      setSupplierForm({ name: "", address: "", phone: "" });
      await loadSuppliers();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  function startEditSupplier(s: RawMaterialSupplier) {
    setEditSupplierId(s.id);
    setEditSupplierForm({ name: s.name, address: s.address ?? "", phone: s.phone ?? "" });
  }

  async function saveEditSupplier(id: number) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    try {
      await apiPut(`/api/raw-material-supplier/${id}`, { entered_by: enteredBy, ...editSupplierForm });
      setEditSupplierId(null);
      await loadSuppliers();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function removeSupplier(id: number) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 거래처를 삭제할까요?")) return;
    try {
      await apiDelete(`/api/raw-material-supplier/${id}`, { entered_by: enteredBy });
      await loadSuppliers();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  const canManage = admin.loggedIn || session.isModifier;
  function canEdit(item: RawMaterial) {
    return !item.locked && (admin.loggedIn || session.isModifier);
  }
  function canDelete(item: RawMaterial) {
    if (item.locked) return false;
    if (admin.loggedIn) return true;
    return session.isModifier && !item.approved_at;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">품목관리 (원재료 마스터)</h1>
        <p className="text-sm text-slate-500 mt-1">
          원재료 코드·거래처·단위·제출처를 등록하면 입고검수·입력부터 부적합이력·양식출력까지
          전체 화면의 드롭다운 소스로 사용됩니다. 관리자가 승인(잠금)하면 수정할 수 없습니다.
        </p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 입력·수정은 editor 권한이 필요합니다.
        </div>
      )}

      <form
        onSubmit={submitMaterial}
        className={`flex flex-col gap-4 bg-white rounded-xl border p-5 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-700">신규 원재료 등록</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">코드</span>
            <input
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              placeholder="A01"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">원재료명</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">성상</span>
            <select
              value={form.form}
              onChange={(e) => setForm((f) => ({ ...f, form: e.target.value as RawMaterialForm }))}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="solid">고상</option>
              <option value="liquid">액상</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">단위</span>
            <input
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              placeholder="톤/kg"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">대분류</span>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">제출처</span>
            <input
              value={form.submitTo}
              onChange={(e) => setForm((f) => ({ ...f, submitTo: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              placeholder="비료관리협회 등"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">초기 재고</span>
            <input
              type="number"
              value={form.initialStock}
              onChange={(e) => setForm((f) => ({ ...f, initialStock: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {saving ? "저장 중..." : "+ 원재료 추가"}
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-700">등록된 원재료 목록</h2>
          <a href="/api/raw-material/export" className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold">
            ⬇ 엑셀 다운로드
          </a>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">코드</th>
              <th className="text-left px-3 py-2">원재료명</th>
              <th className="text-left px-3 py-2">성상</th>
              <th className="text-left px-3 py-2">단위</th>
              <th className="text-left px-3 py-2">제출처</th>
              <th className="text-right px-3 py-2">최근단가</th>
              <th className="text-right px-3 py-2">현재고</th>
              <th className="text-left px-3 py-2">상태</th>
              {canManage && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {materials.map((item) => (
              <tr key={item.key} className="border-t">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{item.key}</td>
                {editKey === item.key ? (
                  <>
                    <td className="px-3 py-2">
                      <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="border rounded-md px-2 py-1 w-28" />
                    </td>
                    <td className="px-3 py-2 text-slate-400">{RAW_MATERIAL_FORM_LABELS[item.form]}</td>
                    <td className="px-3 py-2">
                      <input value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} className="border rounded-md px-2 py-1 w-16" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editForm.submitTo} onChange={(e) => setEditForm((f) => ({ ...f, submitTo: e.target.value }))} className="border rounded-md px-2 py-1 w-28" />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-400">{item.last_price ?? "-"}</td>
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
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">{RAW_MATERIAL_FORM_LABELS[item.form]}</td>
                    <td className="px-3 py-2">{item.unit ?? "-"}</td>
                    <td className="px-3 py-2">{item.submit_to ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.last_price?.toLocaleString() ?? "-"}</td>
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
                          <button onClick={() => saveEditMaterial(item.key)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            저장
                          </button>
                          <button onClick={() => setEditKey(null)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit(item) && (
                            <button onClick={() => startEditMaterial(item)} className="text-xs border rounded-md px-2 py-1 bg-white">
                              수정
                            </button>
                          )}
                          {canDelete(item) && (
                            <button onClick={() => removeMaterial(item.key)} className="text-xs border rounded-md px-2 py-1 bg-white text-red-600">
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
            {materials.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  등록된 원재료가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={submitSupplier}
        className={`flex flex-col gap-4 bg-white rounded-xl border p-5 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-700">거래처 등록 (주소·전화번호는 양식출력에 자동 반영됩니다)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">거래처명</span>
            <input
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">주소</span>
            <input
              value={supplierForm.address}
              onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">전화번호</span>
            <input
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium">
            + 거래처 추가
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">등록된 거래처 목록</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">거래처명</th>
              <th className="text-left px-3 py-2">주소</th>
              <th className="text-left px-3 py-2">전화번호</th>
              {canManage && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t">
                {editSupplierId === s.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input value={editSupplierForm.name} onChange={(e) => setEditSupplierForm((f) => ({ ...f, name: e.target.value }))} className="border rounded-md px-2 py-1 w-32" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editSupplierForm.address} onChange={(e) => setEditSupplierForm((f) => ({ ...f, address: e.target.value }))} className="border rounded-md px-2 py-1 w-56" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editSupplierForm.phone} onChange={(e) => setEditSupplierForm((f) => ({ ...f, phone: e.target.value }))} className="border rounded-md px-2 py-1 w-32" />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">{s.address ?? "-"}</td>
                    <td className="px-3 py-2">{s.phone ?? "-"}</td>
                  </>
                )}
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      {editSupplierId === s.id ? (
                        <>
                          <button onClick={() => saveEditSupplier(s.id)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            저장
                          </button>
                          <button onClick={() => setEditSupplierId(null)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditSupplier(s)} className="text-xs border rounded-md px-2 py-1 bg-white">
                            수정
                          </button>
                          <button onClick={() => removeSupplier(s.id)} className="text-xs border rounded-md px-2 py-1 bg-white text-red-600">
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  등록된 거래처가 없습니다.
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
