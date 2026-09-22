"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut, apiDelete } from "@/lib/apiClient";
import {
  ImprovementPlan,
  ImprovementPlanCategory,
  ImprovementPlanOrgType,
} from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { useSiteSession } from "@/lib/useSiteSession";

type NewPlanForm = {
  category: ImprovementPlanCategory;
  equipmentName: string;
  taskName: string;
  startDate: string;
  endDate: string;
  budget: string;
  orgType: ImprovementPlanOrgType;
  vendorName: string;
};

function emptyPlanForm(): NewPlanForm {
  return {
    category: "보수",
    equipmentName: "",
    taskName: "",
    startDate: "",
    endDate: "",
    budget: "",
    orgType: "MIP",
    vendorName: "",
  };
}

// 업로드 전 브라우저에서 가로 1280px 이하로 축소 + WebP로 압축해 저장 용량을 크게 줄인다.
// (원본이 이미 작아 오히려 커지면 원본을 그대로 사용)
async function compressPhoto(file: File, maxWidth = 1280, quality = 0.75): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], newName, { type: blob.type || "image/webp" });
  } catch {
    return file;
  }
}

async function postForm<T>(url: string, method: "POST" | "PUT", form: FormData): Promise<T> {
  const res = await fetch(url, { method, body: form });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.reload();
    throw new Error("로그인이 만료되어 다시 로그인합니다.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || `요청이 실패했습니다. (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") msg = parsed.error;
    } catch {
      // JSON이 아니면 원문을 그대로 사용
    }
    throw new Error(msg);
  }
  return res.json();
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function daysDiff(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function scheduleBadge(p: ImprovementPlan): { label: string; cls: string } | null {
  if (p.status === "completed" && p.end_date && p.completed_at) {
    const diff = daysDiff(p.end_date, p.completed_at.slice(0, 10));
    return diff > 0
      ? { label: `${diff}일 지연완료`, cls: "bg-red-100 text-red-700" }
      : { label: "정시완료", cls: "bg-emerald-50 text-emerald-700" };
  }
  if ((p.status === "in_progress" || p.status === "pending_approval") && p.end_date) {
    const today = new Date().toISOString().slice(0, 10);
    const diff = daysDiff(today, p.end_date);
    if (diff < 0) return { label: `⚠ ${Math.abs(diff)}일 초과`, cls: "bg-red-100 text-red-700" };
    if (diff <= 3) return { label: `D-${diff}`, cls: "bg-amber-100 text-amber-700" };
  }
  return null;
}

function CategoryBadge({ category }: { category: ImprovementPlanCategory }) {
  const cls =
    category === "신규" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-teal-50 text-teal-700 border-teal-200";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{category}</span>;
}

function OrgLabel({ p }: { p: ImprovementPlan }) {
  if (p.org_type === "MIP") {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">MIP(자체)</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 w-fit">외주</span>
      {p.vendor_name && <span className="text-[11px] text-slate-500">{p.vendor_name}</span>}
    </div>
  );
}

function PhotoThumb({ planId, which, path }: { planId: number; which: "before" | "after"; path: string | null }) {
  if (!path) {
    return (
      <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-300 text-xs">
        없음
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/improvement-plan/${planId}/photo?which=${which}`}
      alt=""
      className="w-9 h-9 rounded-md object-cover bg-slate-100"
    />
  );
}

export default function ImprovementPlanPage() {
  const [plans, setPlans] = useState<ImprovementPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewPlanForm>(emptyPlanForm());
  const [photoBefore, setPhotoBefore] = useState<File | null>(null);
  const [photoBeforePreview, setPhotoBeforePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterText, setFilterText] = useState("");
  const [filterCat, setFilterCat] = useState<"" | ImprovementPlanCategory>("");
  const [filterOrg, setFilterOrg] = useState<"" | ImprovementPlanOrgType>("");

  const [completedOpen, setCompletedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [detail, setDetail] = useState<ImprovementPlan | null>(null);
  const [detailAfterFile, setDetailAfterFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (session.loggedIn && session.displayName) {
      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function loadPlans() {
    try {
      setPlans(await apiGet<ImprovementPlan[]>("/api/improvement-plan"));
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans();
  }, []);

  useEffect(() => {
    return () => {
      if (photoBeforePreview) URL.revokeObjectURL(photoBeforePreview);
    };
  }, [photoBeforePreview]);

  function matches(p: ImprovementPlan): boolean {
    if (filterText && !`${p.equipment_name} ${p.task_name}`.includes(filterText)) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (filterOrg && p.org_type !== filterOrg) return false;
    return true;
  }

  const progress = useMemo(
    () => plans.filter((p) => (p.status === "in_progress" || p.status === "pending_approval") && matches(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg]
  );
  const completed = useMemo(
    () => plans.filter((p) => p.status === "completed" && matches(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg]
  );
  const review = useMemo(
    () => plans.filter((p) => p.status === "review" && matches(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg]
  );

  async function handlePhotoBeforeChange(file: File | null) {
    if (photoBeforePreview) URL.revokeObjectURL(photoBeforePreview);
    if (!file) {
      setPhotoBefore(null);
      setPhotoBeforePreview(null);
      return;
    }
    const compressed = await compressPhoto(file);
    setPhotoBefore(compressed);
    setPhotoBeforePreview(URL.createObjectURL(compressed));
  }

  async function submitPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!form.equipmentName.trim() || !form.taskName.trim()) {
      setMessage("설비명과 작업명을 입력해주세요.");
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("entered_by", enteredBy);
      fd.set("category", form.category);
      fd.set("equipment_name", form.equipmentName.trim());
      fd.set("task_name", form.taskName.trim());
      if (form.startDate) fd.set("start_date", form.startDate);
      if (form.endDate) fd.set("end_date", form.endDate);
      fd.set("budget", form.budget || "0");
      fd.set("org_type", form.orgType);
      if (form.orgType === "외주" && form.vendorName.trim()) fd.set("vendor_name", form.vendorName.trim());
      if (photoBefore) fd.set("photo_before", photoBefore);

      await postForm("/api/improvement-plan", "POST", fd);
      setMessage("개선계획이 등록되었습니다. (우선순위 맨 아래에 추가되었으니 필요하면 순서를 옮겨주세요)");
      setForm(emptyPlanForm());
      handlePhotoBeforeChange(null);
      setShowForm(false);
      await loadPlans();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function reorder(id: number, direction: "up" | "down") {
    setBusyId(id);
    try {
      const rows = await apiPut<ImprovementPlan[]>(`/api/improvement-plan/${id}/priority`, { direction });
      setPlans(rows);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function requestCompletion(id: number, afterFile: File | null) {
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("entered_by", enteredBy);
      if (afterFile) fd.set("photo_after", afterFile);
      const updated = await postForm<ImprovementPlan>(`/api/improvement-plan/${id}/request-completion`, "PUT", fd);
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setDetail((d) => (d && d.id === id ? updated : d));
      setDetailAfterFile(null);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: number) {
    if (!confirm("완료로 승인할까요? 승인 후에는 완료된 계획 목록으로 이동합니다.")) return;
    setBusyId(id);
    try {
      const updated = await apiPut<ImprovementPlan>(`/api/improvement-plan/${id}/decision`, { decision: "approve" });
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setDetail((d) => (d && d.id === id ? updated : d));
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    const reason = window.prompt("반려 사유를 입력해주세요.", "");
    if (reason === null) return;
    setBusyId(id);
    try {
      const updated = await apiPut<ImprovementPlan>(`/api/improvement-plan/${id}/decision`, {
        decision: "reject",
        reason,
      });
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setDetail((d) => (d && d.id === id ? updated : d));
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function flagReview(id: number) {
    const reason = window.prompt("재검토 사유를 입력해주세요.", "");
    if (reason === null) return;
    setBusyId(id);
    try {
      const updated = await apiPut<ImprovementPlan>(`/api/improvement-plan/${id}/review`, {
        reason,
        entered_by: enteredBy,
      });
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setDetail((d) => (d && d.id === id ? updated : d));
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function removePlan(id: number) {
    if (!confirm("이 개선계획을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusyId(id);
    try {
      await apiDelete(`/api/improvement-plan/${id}`);
      setDetail(null);
      await loadPlans();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  const canManageDetail = detail && (detail.status === "in_progress" || detail.status === "pending_approval");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">[개선계획]</h1>
        <p className="text-sm text-slate-500 mt-1">
          설비 개선계획을 등록하고 우선순위대로 관리합니다. 완료 요청은 담당자가, 최종 완료 승인은 관리자만 할 수
          있습니다.
        </p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 등록·처리는 editor 권한이 필요합니다.
        </div>
      )}
      {message && (
        <div className="bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-md px-3 py-2">{message}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          disabled={!session.canWrite}
          className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          + 새 계획 등록
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitPlan} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-slate-700">신규 개선계획 등록</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <EnteredByField
              value={enteredBy}
              onChange={setEnteredBy}
              error={nameError}
              lockedValue={session.loggedIn ? session.displayName : null}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">구분</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ImprovementPlanCategory }))}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="신규">신규</option>
                <option value="보수">보수</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">설비명</span>
              <input
                value={form.equipmentName}
                onChange={(e) => setForm((f) => ({ ...f, equipmentName: e.target.value }))}
                className="border rounded-md px-2 py-1.5"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-slate-600">작업명</span>
              <input
                value={form.taskName}
                onChange={(e) => setForm((f) => ({ ...f, taskName: e.target.value }))}
                className="border rounded-md px-2 py-1.5"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">예상 시작일</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">예상 종료일</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">예산(원)</span>
              <input
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                className="border rounded-md px-2 py-1.5"
                placeholder="1500000"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">시행처</span>
              <select
                value={form.orgType}
                onChange={(e) => setForm((f) => ({ ...f, orgType: e.target.value as ImprovementPlanOrgType }))}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="MIP">MIP(자체)</option>
                <option value="외주">외주</option>
              </select>
            </label>
            {form.orgType === "외주" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">외주업체명</span>
                <input
                  value={form.vendorName}
                  onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                  className="border rounded-md px-2 py-1.5"
                  placeholder="예: 대한설비㈜"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-slate-600">대상사진 (개선 전, 선택)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoBeforeChange(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              <span className="text-xs text-slate-400">
                업로드 시 자동으로 가로 1280px 이하로 축소·압축되어 저장 용량을 절약합니다.
              </span>
              {photoBeforePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBeforePreview} alt="미리보기" className="w-24 h-24 object-cover rounded-md border mt-1" />
              )}
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {saving ? "등록 중..." : "등록"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="border rounded-md px-4 py-1.5 text-sm bg-white"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 1. 진행 중인 계획 - 항상 펼쳐진 상태 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
            1
          </span>
          <h2 className="text-sm font-bold">진행 중인 계획</h2>
          <span className="text-xs text-slate-400">{progress.length}건</span>
        </div>
        <p className="px-4 pt-3 text-xs text-slate-500">
          우선순위 순으로 정렬됩니다 · ▲▼ 버튼으로 순서 변경 · 행을 누르면 사진을 크게 볼 수 있습니다
        </p>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="설비명·작업명 검색"
              className="border rounded-md px-2 py-1.5 text-sm flex-1 min-w-[160px]"
            />
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value as "" | ImprovementPlanCategory)}
              className="border rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">구분 전체</option>
              <option value="신규">신규</option>
              <option value="보수">보수</option>
            </select>
            <select
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value as "" | ImprovementPlanOrgType)}
              className="border rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">시행처 전체</option>
              <option value="MIP">MIP(자체)</option>
              <option value="외주">외주</option>
            </select>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="px-2 py-2">순위</th>
                  <th className="px-2 py-2">사진</th>
                  <th className="px-2 py-2">구분</th>
                  <th className="px-2 py-2">설비명 / 작업명</th>
                  <th className="px-2 py-2">예상일정</th>
                  <th className="px-2 py-2">예산</th>
                  <th className="px-2 py-2">시행처</th>
                  <th className="px-2 py-2">작성자</th>
                  <th className="px-2 py-2">등록일</th>
                  <th className="px-2 py-2">관리</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="text-center text-slate-400 py-6">
                      불러오는 중...
                    </td>
                  </tr>
                ) : progress.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-slate-400 py-6">
                      조건에 맞는 계획이 없습니다.
                    </td>
                  </tr>
                ) : (
                  progress.map((p, idx) => {
                    const pending = p.status === "pending_approval";
                    const badge = scheduleBadge(p);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setDetail(p)}
                        className={`border-t cursor-pointer hover:bg-slate-50 ${
                          idx === 0 ? "bg-amber-50/60" : ""
                        } ${pending ? "bg-amber-50/30" : ""}`}
                      >
                        <td className="px-2 py-2 font-semibold tabular-nums">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <PhotoThumb planId={p.id} which="before" path={p.photo_before_path} />
                        </td>
                        <td className="px-2 py-2">
                          <CategoryBadge category={p.category} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-semibold">
                            {p.equipment_name}{" "}
                            {pending && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                승인대기
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 text-xs">{p.task_name}</div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs">
                          <div>
                            {p.start_date ?? "-"} ~ {p.end_date ?? "-"}
                          </div>
                          {badge && (
                            <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">{won(p.budget)}</td>
                        <td className="px-2 py-2">
                          <OrgLabel p={p} />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs">{p.created_by}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">{p.created_at.slice(0, 10)}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-start gap-1.5">
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={idx === 0 || !session.canWrite || busyId === p.id}
                                onClick={() => reorder(p.id, "up")}
                                className="w-6 h-4 border rounded text-[10px] bg-white disabled:opacity-30"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === progress.length - 1 || !session.canWrite || busyId === p.id}
                                onClick={() => reorder(p.id, "down")}
                                className="w-6 h-4 border rounded text-[10px] bg-white disabled:opacity-30"
                              >
                                ▼
                              </button>
                            </div>
                            {pending ? (
                              session.isAdmin ? (
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    disabled={busyId === p.id}
                                    onClick={() => approve(p.id)}
                                    className="text-xs font-semibold border rounded-md px-2 py-1 text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50"
                                  >
                                    승인
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === p.id}
                                    onClick={() => reject(p.id)}
                                    className="text-xs font-semibold border rounded-md px-2 py-1 text-red-700 border-red-200 bg-white hover:bg-red-50"
                                  >
                                    반려
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs italic text-slate-400">⏳ 관리자 승인 대기</span>
                              )
                            ) : (
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  disabled={!session.canWrite || busyId === p.id}
                                  onClick={() => requestCompletion(p.id, null)}
                                  className="text-xs font-semibold border rounded-md px-2 py-1 text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50 disabled:opacity-40"
                                >
                                  완료 요청
                                </button>
                                <button
                                  type="button"
                                  disabled={!session.canWrite || busyId === p.id}
                                  onClick={() => flagReview(p.id)}
                                  className="text-xs font-semibold border rounded-md px-2 py-1 text-amber-700 border-amber-200 bg-white hover:bg-amber-50 disabled:opacity-40"
                                >
                                  재검토 지정
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 2. 완료된 계획 - 접힘 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setCompletedOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span className="text-sm font-bold">완료된 계획</span>
            <span className="text-xs text-slate-400">{completed.length}건</span>
          </span>
          <span className={`text-xs text-slate-400 transition-transform ${completedOpen ? "rotate-90" : ""}`}>▸</span>
        </button>
        {completedOpen && (
          <div className="px-4 pb-4 flex flex-col">
            {completed.length === 0 ? (
              <div className="text-sm text-slate-400 py-3">완료된 계획이 없습니다.</div>
            ) : (
              completed.map((p) => {
                const badge = scheduleBadge(p);
                return (
                  <div
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="flex items-start gap-3 py-3 border-t first:border-t-0 cursor-pointer hover:bg-slate-50 text-sm"
                  >
                    <PhotoThumb planId={p.id} which="before" path={p.photo_before_path} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{p.equipment_name}</div>
                      <div className="text-slate-500 text-xs">{p.task_name}</div>
                      <div className="flex gap-1.5 mt-1">
                        <CategoryBadge category={p.category} />
                        <OrgLabel p={p} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 flex flex-col gap-1 items-end">
                      <span>완료일 {p.completed_at?.slice(0, 10)}</span>
                      <span>승인: {p.approved_by}</span>
                      {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
                      <span className="tabular-nums">{won(p.budget)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 3. 재검토 사항 - 접힘 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setReviewOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span className="text-sm font-bold">재검토 사항</span>
            <span className="text-xs text-slate-400">{review.length}건</span>
          </span>
          <span className={`text-xs text-slate-400 transition-transform ${reviewOpen ? "rotate-90" : ""}`}>▸</span>
        </button>
        {reviewOpen && (
          <div className="px-4 pb-4 flex flex-col">
            {review.length === 0 ? (
              <div className="text-sm text-slate-400 py-3">재검토 항목이 없습니다.</div>
            ) : (
              review.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setDetail(p)}
                  className="flex items-start gap-3 py-3 border-t first:border-t-0 cursor-pointer hover:bg-slate-50 text-sm"
                >
                  <PhotoThumb planId={p.id} which="before" path={p.photo_before_path} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{p.equipment_name}</div>
                    <div className="text-slate-500 text-xs">{p.review_reason}</div>
                    <div className="flex gap-1.5 mt-1">
                      <CategoryBadge category={p.category} />
                      <OrgLabel p={p} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 flex flex-col gap-1 items-end">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">재검토</span>
                    <span>지정: {p.reviewed_by}</span>
                    <span className="tabular-nums">{won(p.budget)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 상세/사진 크게보기 모달 */}
      {detail && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
              <div>
                <h3 className="text-lg font-extrabold">{detail.equipment_name}</h3>
                <div className="flex gap-1.5 mt-1">
                  <CategoryBadge category={detail.category} />
                  {detail.status === "pending_approval" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      승인대기
                    </span>
                  )}
                  {detail.status === "completed" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      완료
                    </span>
                  )}
                  {detail.status === "review" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">재검토</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-3 px-5">
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
                  {detail.photo_before_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/improvement-plan/${detail.id}/photo?which=before`}
                      alt="개선 전"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-slate-300 text-sm">사진 없음</span>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-500">개선 전</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
                  {detail.photo_after_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/improvement-plan/${detail.id}/photo?which=after`}
                      alt="개선 후"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-slate-300 text-sm">
                      {detail.status === "completed" ? "사진 없음" : "완료 승인 후 표시됩니다"}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-500">개선 후</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
              <div className="col-span-2">
                <div className="text-xs text-slate-400">작업명</div>
                <div className="font-semibold">{detail.task_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">시행처</div>
                <div className="font-semibold">
                  {detail.org_type === "MIP" ? "MIP(자체)" : `외주${detail.vendor_name ? " · " + detail.vendor_name : ""}`}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">예상 일정</div>
                <div className="font-semibold tabular-nums">
                  {detail.start_date ?? "-"} ~ {detail.end_date ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">예산</div>
                <div className="font-semibold tabular-nums">{won(detail.budget)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">작성자</div>
                <div className="font-semibold">{detail.created_by}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">등록일</div>
                <div className="font-semibold tabular-nums">{detail.created_at.slice(0, 10)}</div>
              </div>
              {detail.status === "completed" && (
                <>
                  <div>
                    <div className="text-xs text-slate-400">완료일</div>
                    <div className="font-semibold tabular-nums">{detail.completed_at?.slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">승인자</div>
                    <div className="font-semibold">{detail.approved_by}</div>
                  </div>
                </>
              )}
              {detail.status === "review" && (
                <div className="col-span-2">
                  <div className="text-xs text-slate-400">재검토 사유</div>
                  <div className="font-semibold">{detail.review_reason}</div>
                  <div className="text-xs text-slate-400 mt-1">지정: {detail.reviewed_by}</div>
                </div>
              )}
            </div>

            {canManageDetail && (
              <div className="px-5 pb-5 flex flex-col gap-2 border-t pt-4">
                {detail.status === "in_progress" && session.canWrite && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0] ?? null;
                        setDetailAfterFile(f ? await compressPhoto(f) : null);
                      }}
                      className="text-xs"
                    />
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      onClick={() => requestCompletion(detail.id, detailAfterFile)}
                      className="text-xs font-semibold border rounded-md px-3 py-1.5 text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50"
                    >
                      완료 요청
                    </button>
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      onClick={() => flagReview(detail.id)}
                      className="text-xs font-semibold border rounded-md px-3 py-1.5 text-amber-700 border-amber-200 bg-white hover:bg-amber-50"
                    >
                      재검토 지정
                    </button>
                  </div>
                )}
                {detail.status === "pending_approval" && session.isAdmin && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      onClick={() => approve(detail.id)}
                      className="text-xs font-semibold border rounded-md px-3 py-1.5 text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      onClick={() => reject(detail.id)}
                      className="text-xs font-semibold border rounded-md px-3 py-1.5 text-red-700 border-red-200 bg-white hover:bg-red-50"
                    >
                      반려
                    </button>
                  </div>
                )}
                {detail.status === "pending_approval" && !session.isAdmin && (
                  <span className="text-xs italic text-slate-400">⏳ 관리자 승인 대기 중입니다.</span>
                )}
              </div>
            )}
            {session.isAdmin && (
              <div className="px-5 pb-5 -mt-2">
                <button
                  type="button"
                  disabled={busyId === detail.id}
                  onClick={() => removePlan(detail.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  이 계획 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
