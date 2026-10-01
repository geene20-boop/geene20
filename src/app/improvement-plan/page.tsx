"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPut, apiDelete } from "@/lib/apiClient";
import { ImprovementPlanCategory, ImprovementPlanOrgType, ImprovementPlanView } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { useSiteSession } from "@/lib/useSiteSession";
import { IMPROVEMENT_PLAN_ADMIN_DISPLAY_NAMES } from "@/lib/navGroups";
import { IMPROVEMENT_PLAN_MAX_PHOTOS, computeDashboard, isOverdue } from "@/lib/improvementPlan";
import PhotoPanel from "./PhotoPanel";
import PhotoLightbox from "./PhotoLightbox";
import CommentThread from "./CommentThread";
import PlanDashboard, { DashboardFilter } from "./PlanDashboard";

type NewPlanForm = {
  category: ImprovementPlanCategory;
  equipmentName: string;
  taskName: string;
  startDate: string;
  endDate: string;
  budget: string;
  orgType: ImprovementPlanOrgType;
  vendorName: string;
  assignee: string;
};

function emptyPlanForm(assignee = ""): NewPlanForm {
  return {
    category: "보수",
    equipmentName: "",
    taskName: "",
    startDate: "",
    endDate: "",
    budget: "",
    orgType: "MIP",
    vendorName: "",
    assignee,
  };
}

// 상세 팝업 아래쪽에 펼치는 입력칸: 완료 요청(실제 집행비) / 재검토 사유
type ActionPanel =
  | { kind: "complete" }
  | { kind: "flag" } // 진행중 → 재검토 지정
  | { kind: "reject" } // 승인대기 → 재검토로 보내기 (관리자)
  | { kind: "reopenCompleted" }; // 완료 → 추가 보수 필요, 재검토 (관리자)

const REASON_LABEL: Record<Exclude<ActionPanel["kind"], "complete">, { title: string; button: string }> = {
  flag: { title: "재검토 사유 (필수)", button: "재검토 지정" },
  reject: { title: "재검토로 보내는 이유 (필수)", button: "재검토로 보내기" },
  reopenCompleted: { title: "추가 보수가 필요한 이유 (필수)", button: "재검토로 보내기" },
};

const SEEN_KEY = "improvementPlanCommentSeen";

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSeen(v: Record<string, string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(v));
  } catch {
    // localStorage 사용 불가(시크릿 모드 등)면 '새 의견' 점 표시만 생략된다
  }
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

function scheduleBadge(p: ImprovementPlanView, today: string): { label: string; cls: string } | null {
  if (p.status === "completed" && p.end_date && p.completed_at) {
    const diff = daysDiff(p.end_date, p.completed_at.slice(0, 10));
    return diff > 0
      ? { label: `${diff}일 지연완료`, cls: "bg-red-100 text-red-700" }
      : { label: "정시완료", cls: "bg-emerald-50 text-emerald-700" };
  }
  if ((p.status === "in_progress" || p.status === "pending_approval") && p.end_date) {
    const diff = daysDiff(today, p.end_date);
    if (diff < 0) return { label: `⚠ ${Math.abs(diff)}일 초과`, cls: "bg-red-100 text-red-700" };
    if (diff <= 3) return { label: `D-${diff}`, cls: "bg-amber-100 text-amber-700" };
  }
  return null;
}

// 예산 대비 실제 집행비 표시 (초과는 빨간색)
function CostDiff({ p }: { p: ImprovementPlanView }) {
  if (p.actual_cost == null) return null;
  const diff = p.actual_cost - p.budget;
  if (p.budget > 0 && diff > 0) {
    return (
      <span className="text-[11px] font-semibold text-red-600 whitespace-nowrap">
        +{won(diff)} ({Math.round((p.actual_cost / p.budget) * 100)}%)
      </span>
    );
  }
  if (diff > 0) return <span className="text-[11px] font-semibold text-red-600 whitespace-nowrap">+{won(diff)}</span>;
  return <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">예산 내 ({won(-diff)} 절감)</span>;
}

function CategoryBadge({ category }: { category: ImprovementPlanCategory }) {
  const cls =
    category === "신규" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-teal-50 text-teal-700 border-teal-200";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{category}</span>;
}

function OrgLabel({ p }: { p: ImprovementPlanView }) {
  if (p.org_type === "MIP") {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">
        MIP(자체)
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 w-fit whitespace-nowrap">외주</span>
      {p.vendor_name && <span className="text-[11px] text-slate-500 whitespace-nowrap">{p.vendor_name}</span>}
    </div>
  );
}

function PhotoThumb({ p }: { p: ImprovementPlanView }) {
  const first = p.photos.find((ph) => ph.which === "before") ?? p.photos[0];
  if (!first) {
    return (
      <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-300 text-xs shrink-0">
        없음
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/improvement-plan/${p.id}/photos/${first.id}`}
      alt=""
      className="w-9 h-9 rounded-md object-cover bg-slate-100 shrink-0"
    />
  );
}

function CommentBadge({ p, unread }: { p: ImprovementPlanView; unread: boolean }) {
  if (p.comment_count === 0) return null;
  return (
    <span className="relative inline-flex items-center text-[11px] text-slate-500 whitespace-nowrap" title="의견 수">
      💬 {p.comment_count}
      {unread && <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
    </span>
  );
}

function ReworkBadges({ p }: { p: ImprovementPlanView }) {
  return (
    <>
      {p.reopened_from_completed === 1 && p.status === "review" && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
          완료 후 재검토
        </span>
      )}
      {p.rework_count > 0 && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
          재검토 {p.rework_count}회
        </span>
      )}
    </>
  );
}

const btn = "text-xs font-semibold border rounded-md px-2 py-1 bg-white whitespace-nowrap disabled:opacity-40";
const btnGreen = `${btn} text-emerald-700 border-emerald-200 hover:bg-emerald-50`;
const btnAmber = `${btn} text-amber-700 border-amber-200 hover:bg-amber-50`;
const btnRed = `${btn} text-red-700 border-red-200 hover:bg-red-50`;
const btnSky = `${btn} text-sky-700 border-sky-200 hover:bg-sky-50`;

export default function ImprovementPlanPage() {
  const [plans, setPlans] = useState<ImprovementPlanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const [today, setToday] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewPlanForm>(emptyPlanForm());
  const [newPhotos, setNewPhotos] = useState<{ file: File; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [filterText, setFilterText] = useState("");
  const [filterCat, setFilterCat] = useState<"" | ImprovementPlanCategory>("");
  const [filterOrg, setFilterOrg] = useState<"" | ImprovementPlanOrgType>("");
  const [mineOnly, setMineOnly] = useState(false);
  const [quick, setQuick] = useState<DashboardFilter>("");

  const [completedOpen, setCompletedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ which: "before" | "after"; id: number | null }>({
    which: "before",
    id: null,
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [costInput, setCostInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  const detail = detailId !== null ? plans.find((p) => p.id === detailId) ?? null : null;
  const me = (session.loggedIn && session.displayName) || enteredBy;

  useEffect(() => {
    if (session.loggedIn && session.displayName) {
      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  const loadPlans = useCallback(async () => {
    try {
      setPlans(await apiGet<ImprovementPlanView[]>("/api/improvement-plan"));
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans();
    setToday(localToday());
    setSeen(readSeen());
  }, [loadPlans]);

  useEffect(() => {
    if (editingId !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editingId]);

  // 상세를 열면 그 계획의 의견을 '읽음'으로 표시
  useEffect(() => {
    if (!detail || !detail.last_comment_at) return;
    if (seen[detail.id] === detail.last_comment_at) return;
    const next = { ...seen, [detail.id]: detail.last_comment_at };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(next);
    writeSeen(next);
  }, [detail, seen]);

  function isUnread(p: ImprovementPlanView): boolean {
    if (!p.last_comment_at || p.last_comment_by === me) return false;
    const s = seen[p.id];
    return !s || s < p.last_comment_at;
  }

  function replacePlan(updated: ImprovementPlanView) {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function openDetail(p: ImprovementPlanView, withPanel: ActionPanel | null = null) {
    setDetailId(p.id);
    setSelectedPhoto({ which: "before", id: null });
    setLightboxIndex(null);
    setPanel(withPanel);
    setCostInput(p.actual_cost != null ? String(p.actual_cost) : p.budget ? String(p.budget) : "");
    setReasonInput("");
  }

  function closeDetail() {
    setDetailId(null);
    setPanel(null);
    setLightboxIndex(null);
  }

  function clearNewPhotos() {
    newPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    setNewPhotos([]);
  }

  function openNewForm() {
    if (showForm && editingId === null) {
      setShowForm(false);
      return;
    }
    setEditingId(null);
    setForm(emptyPlanForm(me));
    clearNewPhotos();
    setShowForm(true);
  }

  function startEdit(p: ImprovementPlanView) {
    setEditingId(p.id);
    setForm({
      category: p.category,
      equipmentName: p.equipment_name,
      taskName: p.task_name,
      startDate: p.start_date ?? "",
      endDate: p.end_date ?? "",
      budget: String(p.budget),
      orgType: p.org_type,
      vendorName: p.vendor_name ?? "",
      assignee: p.assignee ?? p.created_by,
    });
    clearNewPhotos();
    closeDetail();
    setShowForm(true);
  }

  // 담당자 입력칸 자동완성 후보: 지금까지 등장한 이름들
  const knownNames = useMemo(() => {
    const s = new Set<string>();
    for (const p of plans) {
      if (p.assignee) s.add(p.assignee);
      s.add(p.created_by);
    }
    if (me) s.add(me);
    return [...s].filter(Boolean).sort();
  }, [plans, me]);

  function matches(p: ImprovementPlanView): boolean {
    if (filterText && !`${p.equipment_name} ${p.task_name}`.includes(filterText)) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (filterOrg && p.org_type !== filterOrg) return false;
    if (mineOnly && p.assignee !== me) return false;
    return true;
  }

  const progress = useMemo(
    () =>
      plans.filter(
        (p) =>
          (p.status === "in_progress" || p.status === "pending_approval") &&
          matches(p) &&
          (quick !== "pending" || p.status === "pending_approval") &&
          (quick !== "overdue" || isOverdue(p, today))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg, mineOnly, quick, today, me]
  );
  const completed = useMemo(
    () => plans.filter((p) => p.status === "completed" && matches(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg, mineOnly, me]
  );
  const review = useMemo(
    () => plans.filter((p) => p.status === "review" && matches(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, filterText, filterCat, filterOrg, mineOnly, me]
  );
  const dashboard = useMemo(() => computeDashboard(plans, today || localToday()), [plans, today]);
  // 순위는 전체 진행 목록 기준 (현황판 칸으로 걸러 봐도 원래 순위가 보이도록)
  const rankById = useMemo(() => {
    const m = new Map<number, number>();
    plans
      .filter((p) => p.status === "in_progress" || p.status === "pending_approval")
      .forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [plans]);
  const allProgressCount = rankById.size;

  function pickDashboard(key: DashboardFilter | "review") {
    if (key === "review") {
      setReviewOpen(true);
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return;
    }
    setQuick(key);
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function addNewPhotos(files: FileList | null) {
    if (!files) return;
    const room = IMPROVEMENT_PLAN_MAX_PHOTOS - newPhotos.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setMessage(`사진은 최대 ${IMPROVEMENT_PLAN_MAX_PHOTOS}장까지 올릴 수 있습니다.`);
    const compressed = await Promise.all(picked.map((f) => compressPhoto(f)));
    setNewPhotos((prev) => [...prev, ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
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
      fd.set("assignee", form.assignee.trim() || enteredBy);

      if (editingId !== null) {
        await postForm(`/api/improvement-plan/${editingId}`, "PUT", fd);
        setMessage("개선계획 내용이 수정되었습니다.");
      } else {
        for (const p of newPhotos) fd.append("photo_before", p.file);
        await postForm("/api/improvement-plan", "POST", fd);
        setMessage("개선계획이 등록되었습니다. (우선순위 맨 아래에 추가되었으니 필요하면 순서를 옮겨주세요)");
      }
      setForm(emptyPlanForm(me));
      clearNewPhotos();
      setEditingId(null);
      setShowForm(false);
      await loadPlans();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function run(id: number, fn: () => Promise<void>) {
    setBusyId(id);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  function reorder(id: number, direction: "up" | "down") {
    return run(id, async () => {
      setPlans(await apiPut<ImprovementPlanView[]>(`/api/improvement-plan/${id}/priority`, { direction }));
    });
  }

  function uploadPhoto(id: number, which: "before" | "after", file: File) {
    return run(id, async () => {
      const fd = new FormData();
      fd.set("entered_by", enteredBy);
      fd.set("which", which);
      fd.set("photo", await compressPhoto(file));
      const updated = await postForm<ImprovementPlanView>(`/api/improvement-plan/${id}/photos`, "POST", fd);
      replacePlan(updated);
      const newest = updated.photos.filter((p) => p.which === which).at(-1);
      setSelectedPhoto({ which, id: newest?.id ?? null });
    });
  }

  function deletePhoto(id: number, photoId: number) {
    return run(id, async () => {
      const res = await fetch(`/api/improvement-plan/${id}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        let msg = t || `요청이 실패했습니다. (${res.status})`;
        try {
          msg = JSON.parse(t).error ?? msg;
        } catch {
          // 원문 사용
        }
        throw new Error(msg);
      }
      replacePlan(await res.json());
      setSelectedPhoto((s) => ({ which: s.which, id: null }));
    });
  }

  function requestCompletion(id: number) {
    return run(id, async () => {
      const updated = await apiPut<ImprovementPlanView>(`/api/improvement-plan/${id}/request-completion`, {
        entered_by: enteredBy,
        actual_cost: costInput,
      });
      replacePlan(updated);
      setPanel(null);
      setMessage("완료 요청을 보냈습니다. 관리자 승인을 기다립니다.");
    });
  }

  function approve(id: number) {
    if (!confirm("완료로 승인할까요? 승인 후에는 완료된 계획 목록으로 이동합니다.")) return;
    return run(id, async () => {
      replacePlan(await apiPut<ImprovementPlanView>(`/api/improvement-plan/${id}/decision`, { decision: "approve" }));
    });
  }

  function submitReason(id: number, kind: Exclude<ActionPanel["kind"], "complete">) {
    const reason = reasonInput.trim();
    if (!reason) {
      setMessage("이유를 입력해주세요.");
      return;
    }
    return run(id, async () => {
      let updated: ImprovementPlanView;
      if (kind === "flag") {
        updated = await apiPut(`/api/improvement-plan/${id}/review`, { reason, entered_by: enteredBy });
      } else if (kind === "reject") {
        updated = await apiPut(`/api/improvement-plan/${id}/decision`, { decision: "reject", reason });
      } else {
        updated = await apiPut(`/api/improvement-plan/${id}/reopen-completed`, { reason });
      }
      replacePlan(updated);
      setPanel(null);
      setReasonInput("");
      setMessage("재검토 사항으로 옮겼습니다.");
    });
  }

  function reopen(id: number) {
    if (!confirm("이 재검토 건을 진행 중인 계획으로 되돌릴까요? 진행중 목록 맨 아래 순위로 들어갑니다.")) return;
    return run(id, async () => {
      replacePlan(await apiPut<ImprovementPlanView>(`/api/improvement-plan/${id}/reopen`, { entered_by: enteredBy }));
      setMessage("진행 중인 계획으로 되돌렸습니다. 필요하면 일정·예산을 수정해주세요.");
    });
  }

  function removePlan(id: number) {
    if (!confirm("이 개선계획을 삭제할까요? 되돌릴 수 없습니다.")) return;
    return run(id, async () => {
      await apiDelete(`/api/improvement-plan/${id}`);
      closeDetail();
      await loadPlans();
    });
  }

  // 관리자(공용 비밀번호)이거나, [개선계획] 완료 승인 권한을 받은 특정 개인(navGroups.ts)이면
  // 이 화면에서는 관리자와 동일하게 완료 승인·재검토 결정을 할 수 있다 (다른 화면 권한에는 영향 없음).
  const canApprove =
    session.isAdmin || (!!session.displayName && IMPROVEMENT_PLAN_ADMIN_DISPLAY_NAMES.has(session.displayName));
  const canComment = session.canWrite || canApprove;
  const canEditDetailPhotos =
    !!detail && (canApprove || (session.canWrite && (detail.status === "in_progress" || detail.status === "review")));

  const exportUrl = (() => {
    const sp = new URLSearchParams();
    if (filterText) sp.set("q", filterText);
    if (filterCat) sp.set("cat", filterCat);
    if (filterOrg) sp.set("org", filterOrg);
    if (mineOnly && me) sp.set("assignee", me);
    const qs = sp.toString();
    return `/api/improvement-plan/export${qs ? `?${qs}` : ""}`;
  })();

  const lightboxPhotos = detail
    ? [...detail.photos.filter((p) => p.which === "before"), ...detail.photos.filter((p) => p.which === "after")]
    : [];

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
        <div className="bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-md px-3 py-2 flex justify-between gap-2">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-sky-500 shrink-0" aria-label="닫기">
            ✕
          </button>
        </div>
      )}

      {!loading && <PlanDashboard d={dashboard} active={quick} onPick={pickDashboard} />}

      <div className="flex justify-end gap-2">
        <a
          href={exportUrl}
          className="border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          엑셀 내려받기
        </a>
        <button
          type="button"
          onClick={openNewForm}
          disabled={!session.canWrite}
          className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          + 새 계획 등록
        </button>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={submitPlan} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-slate-700">
            {editingId !== null ? "개선계획 수정" : "신규 개선계획 등록"}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <EnteredByField
              value={enteredBy}
              onChange={setEnteredBy}
              error={nameError}
              lockedValue={session.loggedIn ? session.displayName : null}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">담당자</span>
              <input
                value={form.assignee}
                onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                list="improvement-plan-names"
                className="border rounded-md px-2 py-1.5"
                placeholder="책임 담당자 이름"
                required
              />
              <datalist id="improvement-plan-names">
                {knownNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
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
            {editingId === null ? (
              <div className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-slate-600">
                  개선 전 사진 (선택, 최대 {IMPROVEMENT_PLAN_MAX_PHOTOS}장)
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {newPhotos.map((p, i) => (
                    <div key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="미리보기" className="w-20 h-20 object-cover rounded-md border" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(p.url);
                          setNewPhotos((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white text-[10px]"
                        aria-label="사진 빼기"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {newPhotos.length < IMPROVEMENT_PLAN_MAX_PHOTOS && (
                    <label className="w-20 h-20 rounded-md border-2 border-dashed border-slate-300 flex items-center justify-center text-xs font-bold text-lime-700 cursor-pointer hover:bg-lime-50">
                      사진+
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addNewPhotos(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  업로드 시 자동으로 가로 1280px 이하로 축소·압축되어 저장 용량을 절약합니다.
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-400 md:col-span-2 self-end">
                사진은 목록에서 계획을 눌러 열리는 상세 화면의 <b>사진+</b> 버튼으로 추가·삭제합니다.
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {saving ? "저장 중..." : editingId !== null ? "저장" : "등록"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="border rounded-md px-4 py-1.5 text-sm bg-white"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 1. 진행 중인 계획 - 항상 펼쳐진 상태 */}
      <div ref={progressRef} className="bg-white rounded-xl border overflow-hidden scroll-mt-4">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
            1
          </span>
          <h2 className="text-sm font-bold">진행 중인 계획</h2>
          <span className="text-xs text-slate-400">{progress.length}건</span>
          {quick && (
            <button
              type="button"
              onClick={() => setQuick("")}
              className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
            >
              {quick === "pending" ? "승인대기만 보는 중" : "기한 초과만 보는 중"} ✕
            </button>
          )}
        </div>
        <p className="px-4 pt-3 text-xs text-slate-500">
          우선순위 순으로 정렬됩니다 · ▲▼ 버튼으로 순서 변경 · 행을 누르면 사진·의견을 볼 수 있습니다
        </p>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
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
            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap px-1">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />내 담당만
            </label>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left whitespace-nowrap">
                  <th className="px-2 py-2 whitespace-nowrap">순위</th>
                  <th className="px-2 py-2 whitespace-nowrap">사진</th>
                  <th className="px-2 py-2 whitespace-nowrap">구분</th>
                  <th className="px-2 py-2 whitespace-nowrap">설비명 / 작업명</th>
                  <th className="px-2 py-2 whitespace-nowrap">예상일정</th>
                  <th className="px-2 py-2 whitespace-nowrap">예산</th>
                  <th className="px-2 py-2 whitespace-nowrap">시행처</th>
                  <th className="px-2 py-2 whitespace-nowrap">담당자</th>
                  <th className="px-2 py-2 whitespace-nowrap">등록일</th>
                  <th className="px-2 py-2 whitespace-nowrap">관리</th>
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
                  progress.map((p) => {
                    const pending = p.status === "pending_approval";
                    const badge = scheduleBadge(p, today);
                    const rank = rankById.get(p.id) ?? 0;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openDetail(p)}
                        className={`border-t cursor-pointer hover:bg-slate-50 ${rank === 1 ? "bg-amber-50/60" : ""} ${
                          pending ? "bg-amber-50/30" : ""
                        }`}
                      >
                        <td className="px-2 py-2 font-semibold tabular-nums">{rank}</td>
                        <td className="px-2 py-2">
                          <PhotoThumb p={p} />
                        </td>
                        <td className="px-2 py-2">
                          <CategoryBadge category={p.category} />
                        </td>
                        <td className="px-2 py-2 min-w-[220px]">
                          <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                            {p.equipment_name}
                            {pending && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                승인대기
                              </span>
                            )}
                            <CommentBadge p={p} unread={isUnread(p)} />
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
                        <td className="px-2 py-2 whitespace-nowrap text-xs">{p.assignee ?? p.created_by}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">{p.created_at.slice(0, 10)}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-start gap-1.5">
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={rank <= 1 || !session.canWrite || busyId === p.id}
                                onClick={() => reorder(p.id, "up")}
                                className="w-6 h-4 border rounded text-[10px] bg-white disabled:opacity-30"
                                aria-label="순위 올리기"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={rank >= allProgressCount || !session.canWrite || busyId === p.id}
                                onClick={() => reorder(p.id, "down")}
                                className="w-6 h-4 border rounded text-[10px] bg-white disabled:opacity-30"
                                aria-label="순위 내리기"
                              >
                                ▼
                              </button>
                            </div>
                            {pending ? (
                              canApprove ? (
                                <div className="flex flex-col gap-1">
                                  <button type="button" disabled={busyId === p.id} onClick={() => approve(p.id)} className={btnGreen}>
                                    승인
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === p.id}
                                    onClick={() => openDetail(p, { kind: "reject" })}
                                    className={btnRed}
                                  >
                                    재검토
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs italic text-slate-400 whitespace-nowrap">⏳ 관리자 승인 대기</span>
                              )
                            ) : (
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  disabled={!session.canWrite || busyId === p.id}
                                  onClick={() => openDetail(p, { kind: "complete" })}
                                  className={btnGreen}
                                >
                                  완료 요청
                                </button>
                                <button
                                  type="button"
                                  disabled={!session.canWrite || busyId === p.id}
                                  onClick={() => openDetail(p, { kind: "flag" })}
                                  className={btnAmber}
                                >
                                  재검토 지정
                                </button>
                                <button
                                  type="button"
                                  disabled={!session.canWrite || busyId === p.id}
                                  onClick={() => startEdit(p)}
                                  className={btnSky}
                                >
                                  수정
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
                const badge = scheduleBadge(p, today);
                return (
                  <div
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="flex items-start gap-3 py-3 border-t first:border-t-0 cursor-pointer hover:bg-slate-50 text-sm"
                  >
                    <PhotoThumb p={p} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                        {p.equipment_name}
                        <CommentBadge p={p} unread={isUnread(p)} />
                      </div>
                      <div className="text-slate-500 text-xs">{p.task_name}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <CategoryBadge category={p.category} />
                        <OrgLabel p={p} />
                        <ReworkBadges p={p} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 flex flex-col gap-1 items-end">
                      <span className="whitespace-nowrap">완료일 {p.completed_at?.slice(0, 10)}</span>
                      <span className="whitespace-nowrap">승인: {p.approved_by}</span>
                      {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
                      <span className="tabular-nums whitespace-nowrap">
                        예산 {won(p.budget)}
                        {p.actual_cost != null && ` · 집행 ${won(p.actual_cost)}`}
                      </span>
                      <CostDiff p={p} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 3. 재검토 사항 - 접힘 */}
      <div ref={reviewRef} className="bg-white rounded-xl border overflow-hidden scroll-mt-4">
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
                  onClick={() => openDetail(p)}
                  className="flex items-start gap-3 py-3 border-t first:border-t-0 cursor-pointer hover:bg-slate-50 text-sm"
                >
                  <PhotoThumb p={p} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                      {p.equipment_name}
                      <CommentBadge p={p} unread={isUnread(p)} />
                    </div>
                    <div className="text-slate-500 text-xs">{p.review_reason}</div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <CategoryBadge category={p.category} />
                      <OrgLabel p={p} />
                      <ReworkBadges p={p} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 flex flex-col gap-1 items-end">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">재검토</span>
                    <span className="whitespace-nowrap">지정: {p.reviewed_by}</span>
                    <span className="whitespace-nowrap">담당: {p.assignee ?? p.created_by}</span>
                    <button
                      type="button"
                      disabled={!session.canWrite || busyId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(p, { kind: "complete" });
                      }}
                      className={btnGreen}
                    >
                      재작업 완료 요청
                    </button>
                    <button
                      type="button"
                      disabled={!session.canWrite || busyId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        reopen(p.id);
                      }}
                      className={btnSky}
                    >
                      진행중으로 복귀
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 상세 모달: 사진(크게 보기·사진+), 정보, 처리 버튼, 의견란 */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4" onClick={closeDetail}>
          <div
            className="w-full max-w-[580px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
              <div>
                <h3 className="text-lg font-extrabold">{detail.equipment_name}</h3>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <CategoryBadge category={detail.category} />
                  {detail.status === "in_progress" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                      진행중
                    </span>
                  )}
                  {detail.status === "pending_approval" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">승인대기</span>
                  )}
                  {detail.status === "completed" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      완료
                    </span>
                  )}
                  {detail.status === "review" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">재검토</span>
                  )}
                  <ReworkBadges p={detail} />
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 text-sm shrink-0"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <PhotoPanel
              planId={detail.id}
              photos={detail.photos}
              selected={selectedPhoto}
              onSelect={(which, id) => setSelectedPhoto({ which, id })}
              onOpen={(photoId) => {
                const i = lightboxPhotos.findIndex((p) => p.id === photoId);
                if (i >= 0) setLightboxIndex(i);
              }}
              canEdit={canEditDetailPhotos}
              busy={busyId === detail.id}
              onUpload={(which, file) => uploadPhoto(detail.id, which, file)}
              onDelete={(photoId) => deletePhoto(detail.id, photoId)}
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
              <div className="col-span-2">
                <div className="text-xs text-slate-400">작업명</div>
                <div className="font-semibold">{detail.task_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">담당자</div>
                <div className="font-semibold">{detail.assignee ?? detail.created_by}</div>
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
              {detail.actual_cost != null && (
                <div className="col-span-2">
                  <div className="text-xs text-slate-400">실제 집행비</div>
                  <div className="font-semibold tabular-nums flex items-center gap-2 flex-wrap">
                    {won(detail.actual_cost)} <CostDiff p={detail} />
                  </div>
                </div>
              )}
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

            {/* 처리 입력칸: 완료 요청(실제 집행비) / 재검토 사유 */}
            {panel?.kind === "complete" && (detail.status === "in_progress" || detail.status === "review") && (
              <div className="mx-5 mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 flex flex-col gap-2">
                <label className="text-sm font-bold text-emerald-800" htmlFor="ip-actual-cost">
                  {detail.status === "review" ? "재작업 완료 요청" : "완료 요청"} — 실제 집행비(원)
                </label>
                <input
                  id="ip-actual-cost"
                  type="number"
                  min="0"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm bg-white"
                  placeholder="실제로 쓴 비용 (예산과 같으면 그대로 두세요)"
                />
                <span className="text-xs text-emerald-800">
                  예산 {won(detail.budget)}
                  {costInput !== "" && Number(costInput) > detail.budget && (
                    <b className="text-red-600"> · 예산보다 {won(Number(costInput) - detail.budget)} 많습니다</b>
                  )}
                </span>
                {detail.photos.every((p) => p.which !== "after") && (
                  <span className="text-xs text-amber-700">
                    ⚠ 개선 후 사진이 없습니다. 위쪽 <b>개선 후</b> 옆 <b>사진+</b>로 먼저 올려주시면 승인이 빨라집니다.
                  </span>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === detail.id}
                    onClick={() => requestCompletion(detail.id)}
                    className="bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    {detail.status === "review" ? "재작업 완료 요청 보내기" : "완료 요청 보내기"}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={btn}>
                    취소
                  </button>
                </div>
              </div>
            )}
            {panel && panel.kind !== "complete" && (
              <div className="mx-5 mb-4 rounded-xl border border-red-300 bg-red-50 p-3 flex flex-col gap-2">
                <label className="text-sm font-bold text-red-700" htmlFor="ip-reason">
                  {REASON_LABEL[panel.kind].title}
                </label>
                <textarea
                  id="ip-reason"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="border rounded-md px-2 py-1.5 text-sm bg-white resize-y"
                  placeholder="예: 덕트 하부 플랜지에서 분진 샘. 패킹 교체 후 다시 완료 요청 바랍니다."
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === detail.id || !reasonInput.trim()}
                    onClick={() => submitReason(detail.id, panel.kind as Exclude<ActionPanel["kind"], "complete">)}
                    className="bg-red-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    {REASON_LABEL[panel.kind].button}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={btn}>
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* 상태별 처리 버튼 */}
            {!panel && (
              <div className="px-5 pb-4 flex flex-wrap gap-2 border-t pt-4">
                {detail.status === "in_progress" && session.canWrite && (
                  <>
                    <button type="button" disabled={busyId === detail.id} onClick={() => setPanel({ kind: "complete" })} className={btnGreen}>
                      완료 요청
                    </button>
                    <button type="button" disabled={busyId === detail.id} onClick={() => setPanel({ kind: "flag" })} className={btnAmber}>
                      재검토 지정
                    </button>
                    <button type="button" disabled={busyId === detail.id} onClick={() => startEdit(detail)} className={btnSky}>
                      수정
                    </button>
                  </>
                )}
                {detail.status === "review" && session.canWrite && (
                  <>
                    <button type="button" disabled={busyId === detail.id} onClick={() => setPanel({ kind: "complete" })} className={btnGreen}>
                      재작업 완료 요청
                    </button>
                    <button type="button" disabled={busyId === detail.id} onClick={() => reopen(detail.id)} className={btnSky}>
                      진행중으로 복귀
                    </button>
                  </>
                )}
                {detail.status === "pending_approval" && canApprove && (
                  <>
                    <button type="button" disabled={busyId === detail.id} onClick={() => approve(detail.id)} className={btnGreen}>
                      승인
                    </button>
                    <button type="button" disabled={busyId === detail.id} onClick={() => setPanel({ kind: "reject" })} className={btnRed}>
                      재검토로 보내기
                    </button>
                  </>
                )}
                {detail.status === "pending_approval" && !canApprove && (
                  <span className="text-xs italic text-slate-400">⏳ 관리자 승인 대기 중입니다.</span>
                )}
                {detail.status === "completed" && canApprove && (
                  <button
                    type="button"
                    disabled={busyId === detail.id}
                    onClick={() => setPanel({ kind: "reopenCompleted" })}
                    className={btnRed}
                  >
                    추가 보수 필요 → 재검토
                  </button>
                )}
              </div>
            )}

            <CommentThread
              planId={detail.id}
              me={me}
              canWrite={canComment}
              reloadKey={`${detail.status}-${detail.updated_at}`}
              onChanged={loadPlans}
            />

            {session.isAdmin && (
              <div className="px-5 pb-5">
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

      {detail && lightboxIndex !== null && (
        <PhotoLightbox
          planId={detail.id}
          photos={lightboxPhotos}
          index={lightboxIndex}
          onIndexChange={(i) => {
            setLightboxIndex(i);
            const p = lightboxPhotos[i];
            if (p) setSelectedPhoto({ which: p.which, id: p.id });
          }}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
