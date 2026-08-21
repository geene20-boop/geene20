"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { RawMaterial, RawMaterialInbound, RawMaterialJudgment, RawMaterialSupplier } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { materialLabel, todayStr } from "@/lib/rawMaterialClient";
import { useSiteSession } from "@/lib/useSiteSession";

type FormState = {
  date: string;
  materialKey: string;
  supplierId: string;
  qty: string;
  unitPrice: string;
  vehicleNo: string;
  judgment: RawMaterialJudgment;
  problem: string;
  reason: string;
  actionTaken: string;
};

function emptyForm(): FormState {
  return {
    date: todayStr(),
    materialKey: "",
    supplierId: "",
    qty: "",
    unitPrice: "",
    vehicleNo: "",
    judgment: "OK",
    problem: "",
    reason: "",
    actionTaken: "",
  };
}

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

export default function RawMaterialEntryPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<RawMaterialSupplier[]>([]);
  const [entries, setEntries] = useState<RawMaterialInbound[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(todayStr());
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "lock"; row: RawMaterialInbound } | null>(
    null
  );
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
  async function loadEntries(from?: string, to?: string) {
    setEntries(
      await apiGet<RawMaterialInbound[]>(`/api/raw-material-inbound?from=${from ?? rangeFrom}&to=${to ?? rangeTo}`)
    );
  }

  function showAll() {
    const from = "2000-01-01";
    const to = todayStr();
    setRangeFrom(from);
    setRangeTo(to);
    loadEntries(from, to);
  }

  function downloadXlsx() {
    window.location.href = `/api/raw-material-inbound/export?from=${rangeFrom}&to=${rangeTo}`;
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMaterials();
    loadSuppliers();
    loadEntries();
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);
  const selectedMaterial = form.materialKey ? materialByKey.get(form.materialKey) : undefined;
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [String(s.id), s])), [suppliers]);
  const qtyNum = n(form.qty);
  const priceNum = n(form.unitPrice);
  const amount = qtyNum != null && priceNum != null ? qtyNum * priceNum : null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectMaterial(key: string) {
    const item = materialByKey.get(key);
    setForm((f) => ({
      ...f,
      materialKey: key,
      unitPrice: item?.last_price != null ? String(item.last_price) : f.unitPrice,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (form.judgment === "NG" && !form.problem.trim()) {
      setMessage("NG 판정 시 문제점을 입력해주세요.");
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      const supplier = form.supplierId ? supplierById.get(form.supplierId) : undefined;
      const payload = {
        entered_by: enteredBy,
        date: form.date,
        materialKey: form.materialKey,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        qty: n(form.qty),
        unit: selectedMaterial?.unit ?? null,
        unitPrice: n(form.unitPrice),
        vehicleNo: form.vehicleNo || null,
        judgment: form.judgment,
        problem: form.judgment === "NG" ? form.problem || null : null,
        reason: form.judgment === "NG" ? form.reason || null : null,
        actionTaken: form.judgment === "NG" ? form.actionTaken || null : null,
      };
      if (editingId) {
        await apiPut(`/api/raw-material-inbound/${editingId}`, payload);
        setMessage("수정되었습니다.");
      } else {
        await apiPost("/api/raw-material-inbound", payload);
        setMessage("등록되었습니다.");
      }
      setForm(emptyForm());
      setEditingId(null);
      await Promise.all([loadMaterials(), loadEntries()]);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: RawMaterialInbound) {
    setEditingId(row.id);
    setForm({
      date: row.date,
      materialKey: row.material_key,
      supplierId: row.supplier_id != null ? String(row.supplier_id) : "",
      qty: String(row.qty),
      unitPrice: row.unit_price != null ? String(row.unit_price) : "",
      vehicleNo: row.vehicle_no ?? "",
      judgment: row.judgment,
      problem: row.problem ?? "",
      reason: row.reason ?? "",
      actionTaken: row.action_taken ?? "",
    });
  }

  async function removeEntry(id: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 입고 내역을 삭제할까요? 재고가 원래대로 복원됩니다.")) return;
    await apiDelete(`/api/raw-material-inbound/${id}`, { entered_by: enteredBy });
    await Promise.all([loadMaterials(), loadEntries()]);
  }

  async function toggleLock(row: RawMaterialInbound, actorOverride?: string) {
    const actor = actorOverride ?? enteredBy;
    if (!actor.trim()) {
      setNameError(true);
      return;
    }
    await apiPut(`/api/raw-material-inbound/${row.id}/lock`, { entered_by: actor, locked: !row.locked });
    await loadEntries();
  }

  function canEditRow(row: RawMaterialInbound) {
    return !row.locked && (admin.loggedIn || session.isModifier);
  }
  function canDeleteRow(row: RawMaterialInbound) {
    if (row.locked) return false;
    if (admin.loggedIn) return true;
    return session.isModifier && !row.approved_at;
  }

  // 수정·승인은 관리자/수정권한 계정에게만 실제로 허용되지만, 그 권한이 없는 상태에서도 버튼은
  // 입고 내역 옆에 바로 보이게 해서 누르면 관리자 로그인부터 이어서 진행할 수 있게 한다.
  function handleEditClick(row: RawMaterialInbound) {
    if (canEditRow(row)) {
      startEdit(row);
    } else {
      setPendingAction({ type: "edit", row });
      setShowAdminModal(true);
    }
  }
  function handleLockClick(row: RawMaterialInbound) {
    if (admin.loggedIn) {
      toggleLock(row);
    } else {
      setPendingAction({ type: "lock", row });
      setShowAdminModal(true);
    }
  }

  // 관리자 로그인 모달에서 로그인이 실제로 성공한 시점(onSuccess)에 이어서 실행한다 (아래 모달 참고).
  // 로그인 직후에는 session/enteredBy state가 아직 갱신되기 전일 수 있어, 승인 처리에는 방금 로그인한
  // 관리자 이름(freshAdminName)을 직접 넘겨 빈 이름으로 막히는 일이 없게 한다.
  function runPendingAction(freshAdminName?: string | null) {
    if (!pendingAction) return;
    const { type, row } = pendingAction;
    setPendingAction(null);
    if (type === "edit") startEdit(row);
    else toggleLock(row, freshAdminName ?? undefined);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">원재료 입고검수·입력</h1>
        <p className="text-sm text-slate-500 mt-1">
          차량 입고 시 검수 판정과 수량·단가를 함께 입력합니다. NG 판정 시 부적합이력에 자동 등록되고,
          단가가 이전과 다르면 단가변동이력에 자동 기록됩니다.
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
            <span className="text-slate-600">입고일자</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">공급처</span>
            <select
              value={form.supplierId}
              onChange={(e) => set("supplierId", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="">선택</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">원재료</span>
            <select
              value={form.materialKey}
              onChange={(e) => selectMaterial(e.target.value)}
              className="border rounded-md px-2 py-1.5"
              required
            >
              <option value="">선택</option>
              {materials.map((m) => (
                <option key={m.key} value={m.key}>
                  {materialLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">수량{selectedMaterial?.unit ? ` (${selectedMaterial.unit})` : ""}</span>
            <input
              type="number"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              className="border rounded-md px-2 py-1.5"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">
              단가{" "}
              {selectedMaterial?.last_price != null && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                  최근단가 자동입력
                </span>
              )}
            </span>
            <input
              type="number"
              value={form.unitPrice}
              onChange={(e) => set("unitPrice", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">금액 (자동계산)</span>
            <input
              value={amount != null ? amount.toLocaleString() : ""}
              readOnly
              className="border rounded-md px-2 py-1.5 bg-slate-100 text-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비고 (차량번호)</span>
            <input
              value={form.vehicleNo}
              onChange={(e) => set("vehicleNo", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>

        <div className="border-t pt-3">
          <span className="text-sm text-slate-600 mb-2 block">입고검수 판정</span>
          <div className="flex gap-2 max-w-sm">
            <button
              type="button"
              onClick={() => set("judgment", "OK")}
              className={`flex-1 rounded-md border py-2 text-sm font-semibold ${
                form.judgment === "OK"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              OK 적합
            </button>
            <button
              type="button"
              onClick={() => set("judgment", "NG")}
              className={`flex-1 rounded-md border py-2 text-sm font-semibold ${
                form.judgment === "NG"
                  ? "bg-red-50 text-red-700 border-red-300"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              NG 부적합
            </button>
          </div>

          {form.judgment === "NG" && (
            <div className="mt-3 border border-dashed border-red-200 bg-red-50/50 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">문제점</span>
                <input
                  value={form.problem}
                  onChange={(e) => set("problem", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">사유</span>
                <input
                  value={form.reason}
                  onChange={(e) => set("reason", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">조치내용</span>
                <input
                  value={form.actionTaken}
                  onChange={(e) => set("actionTaken", e.target.value)}
                  className="border rounded-md px-2 py-1.5"
                />
              </label>
              <p className="md:col-span-3 text-[11px] text-red-500">
                NG로 저장하면 &ldquo;부적합이력&rdquo; 화면에 자동으로 나타납니다.
              </p>
            </div>
          )}
        </div>

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
            {saving ? "저장 중..." : editingId ? "수정 저장" : "저장 (입고대장·재고·이력 동시 반영)"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">입고 내역</h2>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">조회기간</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
            </label>
            <span className="text-xs text-slate-400 pb-1.5">~</span>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500 opacity-0">종료일</span>
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
            <button
              type="button"
              onClick={showAll}
              className="border rounded-md px-3 py-1.5 text-xs font-medium bg-white"
            >
              전체보기
            </button>
            <button
              type="button"
              onClick={downloadXlsx}
              className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              ⬇ 엑셀 다운로드
            </button>
          </div>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">공급처</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-left px-3 py-2">차량번호</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-right px-3 py-2">단가</th>
              <th className="text-right px-3 py-2">금액</th>
              <th className="text-left px-3 py-2">판정</th>
              <th className="text-left px-3 py-2">관리</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => {
              const material = materialByKey.get(row.material_key);
              return (
                <tr key={row.id} className={`border-t ${row.judgment === "NG" ? "bg-red-50/40" : ""}`}>
                  <td className="px-3 py-2">{row.supplier_name ?? "-"}</td>
                  <td className="px-3 py-2">{material ? materialLabel(material) : row.material_key}</td>
                  <td className="px-3 py-2">{row.vehicle_no ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qty}
                    {row.unit ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.unit_price?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.amount?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                        row.judgment === "NG"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {row.judgment}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      {!row.locked && (
                        <button onClick={() => handleEditClick(row)} className="text-xs border rounded-md px-2 py-1 bg-white">
                          수정
                        </button>
                      )}
                      {canDeleteRow(row) && (
                        <button
                          onClick={() => removeEntry(row.id)}
                          className="text-xs border rounded-md px-2 py-1 bg-white text-red-600"
                        >
                          삭제
                        </button>
                      )}
                      <button onClick={() => handleLockClick(row)} className="text-xs border rounded-md px-2 py-1 bg-white">
                        {row.locked ? "승인해제" : "승인"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  해당 기간에 입고 기록이 없습니다.
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
        <AdminLoginModal
          onClose={() => {
            setShowAdminModal(false);
            setPendingAction(null);
          }}
          onSuccess={async () => {
            const info = await admin.refresh();
            session.refresh();
            setShowAdminModal(false);
            runPendingAction(info.name);
          }}
        />
      )}
    </div>
  );
}
