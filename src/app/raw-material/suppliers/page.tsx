"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { RawMaterialSupplier } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { useSiteSession } from "@/lib/useSiteSession";

export default function RawMaterialSuppliersPage() {
  const [suppliers, setSuppliers] = useState<RawMaterialSupplier[]>([]);
  const [supplierForm, setSupplierForm] = useState({ name: "", address: "", phone: "", country: "" });
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<number | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState({ name: "", address: "", phone: "", country: "" });
  const session = useSiteSession();

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function loadSuppliers() {
    setSuppliers(await apiGet<RawMaterialSupplier[]>("/api/raw-material-supplier"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSuppliers();
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        country: supplierForm.country || null,
      });
      setSupplierForm({ name: "", address: "", phone: "", country: "" });
      setMessage("공급처가 추가되었습니다.");
      await loadSuppliers();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  function startEditSupplier(s: RawMaterialSupplier) {
    setEditSupplierId(s.id);
    setEditSupplierForm({ name: s.name, address: s.address ?? "", phone: s.phone ?? "", country: s.country ?? "" });
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
    if (!confirm("이 공급처를 삭제할까요?")) return;
    try {
      await apiDelete(`/api/raw-material-supplier/${id}`, { entered_by: enteredBy });
      await loadSuppliers();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  const canManage = admin.loggedIn || session.isModifier;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">공급처 관리대장</h1>
        <p className="text-sm text-slate-500 mt-1">
          거래하는 공급처의 상호명·주소·전화번호를 등록·관리합니다. 여기 등록한 정보는 입고입력·
          입고대장 조회·양식출력(별지 19호·40호)에서 자동으로 사용됩니다.
        </p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 입력·수정은 editor 권한이 필요합니다.
        </div>
      )}

      <form
        onSubmit={submitSupplier}
        className={`flex flex-col gap-4 bg-white rounded-xl border p-5 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-700">신규 공급처 등록</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">상호명</span>
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">생산국가 (별지19호의2용)</span>
            <input
              value={supplierForm.country}
              onChange={(e) => setSupplierForm((f) => ({ ...f, country: e.target.value }))}
              className="border rounded-md px-2 py-1.5"
              placeholder="한국"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium">
            + 공급처 추가
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">등록된 공급처 목록 ({suppliers.length}개)</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">상호명</th>
              <th className="text-left px-3 py-2">주소</th>
              <th className="text-left px-3 py-2">전화번호</th>
              <th className="text-left px-3 py-2">생산국가</th>
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
                    <td className="px-3 py-2">
                      <input value={editSupplierForm.country} onChange={(e) => setEditSupplierForm((f) => ({ ...f, country: e.target.value }))} className="border rounded-md px-2 py-1 w-20" />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">{s.address ?? "-"}</td>
                    <td className="px-3 py-2">{s.phone ?? "-"}</td>
                    <td className="px-3 py-2">{s.country ?? "-"}</td>
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
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  등록된 공급처가 없습니다.
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
