"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EnteredByField from "@/components/EnteredByField";
import { MoveMenu, RankCell } from "@/components/RankControls";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import {
  PURCHASE_MAX_FILES,
  PURCHASE_PURPOSES,
  PURCHASE_UNITS,
  PURCHASE_WAIT_WARN_DAYS,
  PURPOSE_QUICK_TEXT,
  addDays,
  computePurchaseDashboard,
  daysBetween,
  isLate,
  waitDays,
} from "@/lib/purchase";
import { PurchasePurpose, PurchaseView } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import { useSiteSession } from "@/lib/useSiteSession";
import { ApproveDialog, DeclineDialog, ReceiveDialog, ShareDialog } from "./PurchaseDialogs";
import PurchaseDetail from "./PurchaseDetail";
import { PurchaseDashboardTiles, PurchaseStats, QuickFilter } from "./PurchaseSummary";
import {
  BudgetDiff,
  EtaPill,
  Pill,
  PurposePill,
  WaitPill,
  btn,
  btnKakao,
  btnPrimary,
  btnRed,
  compressImage,
  fmtQty,
  inputCls,
  localToday,
  md,
  sendForm,
  won,
} from "./ui";

export type PurchaseTab = "request" | "order" | "receive";

const TABS: { key: PurchaseTab; label: string; href: string; status: PurchaseView["status"] }[] = [
  { key: "request", label: "① 구매요청", href: "/purchase/request", status: "requested" },
  { key: "order", label: "② 발주", href: "/purchase/order", status: "ordered" },
  { key: "receive", label: "③ 입고", href: "/purchase/receive", status: "received" },
];

type NewForm = {
  part_name: string;
  qty: string;
  unit: string;
  expected_date: string;
  budget: string;
  vendor: string;
  purpose: PurchasePurpose;
  purpose_detail: string;
  note: string;
  urgent: boolean;
};

function emptyForm(today: string): NewForm {
  return {
    part_name: "",
    qty: "1",
    unit: "EA",
    expected_date: today ? addDays(today, 21) : "",
    budget: "",
    vendor: "",
    purpose: "고장수리",
    purpose_detail: "",
    note: "",
    urgent: false,
  };
}

type Dialog =
  | { kind: "approve"; ids: number[] }
  | { kind: "decline"; id: number }
  | { kind: "receive"; id: number }
  | { kind: "share"; id: number; fresh: boolean }
  | null;

const FORM_OPEN_KEY = "purchaseFormOpen";
const th = "text-left text-xs font-semibold text-slate-500 px-2.5 py-2 whitespace-nowrap";
const td = "px-2.5 py-2 align-middle whitespace-nowrap";

// 부품명 칸: 이름(누르면 상세) + 사용목적·긴급·첨부·의견 수 + 사용처 상세 + 최근 승인자 의견
function NameCell({ p, onOpen }: { p: PurchaseView; onOpen: () => void }) {
  return (
    <td className={`${td} whitespace-normal min-w-[220px] max-w-[360px]`}>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={onOpen} className="font-semibold text-left hover:text-emerald-700 hover:underline">
          {p.part_name}
        </button>
        <PurposePill p={p} />
        {!!p.urgent && <Pill tone="red">긴급</Pill>}
        {p.attachments.length > 0 && (
          <span className="text-[11px] text-slate-500" title="첨부 파일">
            📎{p.attachments.length}
          </span>
        )}
        {p.comment_count > 0 && (
          <span className="text-[11px] text-slate-500" title="의견 수">
            💬{p.comment_count}
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 truncate" title={p.purpose_detail}>
        {p.purpose_detail}
      </div>
      {p.last_admin_comment && (
        <div className="text-xs text-violet-700 truncate" title={p.last_admin_comment}>
          ↳ 승인자: {p.last_admin_comment}
        </div>
      )}
    </td>
  );
}

export default function PurchasePage({ tab }: { tab: PurchaseTab }) {
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [items, setItems] = useState<PurchaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(true);
  const [form, setForm] = useState<NewForm>(emptyForm(""));
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<"" | PurchasePurpose>("");
  const [quick, setQuick] = useState<QuickFilter>("");
  const [showDeclined, setShowDeclined] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const isApprover = session.isAdmin;
  const canWrite = session.canWrite;
  const me = (session.loggedIn && session.displayName) || enteredBy;
  const current = TABS.find((t) => t.key === tab)!;

  useEffect(() => {
    if (session.loggedIn && session.displayName) setEnteredBy(session.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  const load = useCallback(async () => {
    try {
      setItems(await apiGet<PurchaseView[]>("/api/purchase"));
    } catch (e) {
      setMessage(`오류: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = localToday();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(t);
    setForm(emptyForm(t));
    const f = new URLSearchParams(window.location.search).get("f") as QuickFilter | null;
    if (f) setQuick(f);
    try {
      if (localStorage.getItem(FORM_OPEN_KEY) === "0") setFormOpen(false);
    } catch {
      // 저장소를 못 쓰면 항상 펼친 상태
    }
    load();
  }, [load]);

  function toggleForm(open: boolean) {
    setFormOpen(open);
    try {
      localStorage.setItem(FORM_OPEN_KEY, open ? "1" : "0");
    } catch {
      // 무시
    }
  }

  const dashboard = useMemo(() => computePurchaseDashboard(items, today), [items, today]);
  const counts = useMemo(() => {
    const c = { requested: 0, ordered: 0, received: 0, declined: 0 };
    for (const i of items) {
      if (i.status === "rejected" || i.status === "on_hold") c.declined++;
      else c[i.status]++;
    }
    return c;
  }, [items]);
  const requestedAll = useMemo(() => items.filter((i) => i.status === "requested"), [items]);

  // 자동완성: 지금까지 쓴 부품명·구입처, 부품별 가장 최근 구매 기록
  const { partNames, vendors, lastBuy } = useMemo(() => {
    const parts = new Set<string>();
    const vs = new Set<string>();
    const last = new Map<string, PurchaseView>();
    for (const i of items) {
      parts.add(i.part_name);
      if (i.vendor) vs.add(i.vendor);
      if (i.order_date && i.order_amount != null) {
        const prev = last.get(i.part_name);
        if (!prev || (prev.order_date ?? "") < i.order_date) last.set(i.part_name, i);
      }
    }
    return { partNames: [...parts].sort(), vendors: [...vs].sort(), lastBuy: last };
  }, [items]);
  const hint = lastBuy.get(form.part_name.trim());

  function matches(p: PurchaseView): boolean {
    if (purposeFilter && p.purpose !== purposeFilter) return false;
    if (q && !`${p.part_name} ${p.vendor ?? ""} ${p.purpose_detail} ${p.requested_by}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (quick === "urgent" && !p.urgent) return false;
    if (quick === "old" && waitDays(p, today) < PURCHASE_WAIT_WARN_DAYS) return false;
    if (quick === "late" && !isLate(p, today)) return false;
    if (quick === "partial" && !(p.received_qty > 0)) return false;
    if (quick === "unshared" && p.kakao_shared_at) return false;
    return true;
  }
  const list = items.filter((i) => i.status === current.status && matches(i));
  const declined = items.filter((i) => (i.status === "rejected" || i.status === "on_hold") && matches(i));

  const detail = detailId !== null ? items.find((i) => i.id === detailId) ?? null : null;
  const dialogItem = dialog && dialog.kind !== "approve" ? items.find((i) => i.id === dialog.id) ?? null : null;

  function flash(msg?: string) {
    if (msg) setMessage(msg);
    load();
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function applyHistory(name: string) {
    const h = lastBuy.get(name.trim());
    setForm((f) => ({
      ...f,
      part_name: name,
      ...(h
        ? {
            vendor: f.vendor || h.vendor || "",
            budget: f.budget || String(Math.round(h.order_amount ?? h.budget)),
            unit: h.unit,
            purpose: h.purpose,
          }
        : {}),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!me.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    if (files.length > PURCHASE_MAX_FILES) {
      setMessage(`첨부는 최대 ${PURCHASE_MAX_FILES}개까지 올릴 수 있습니다.`);
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.set(k, typeof v === "boolean" ? (v ? "1" : "0") : v);
      fd.set("entered_by", me);
      for (const f of files) fd.append("files", await compressImage(f));
      const created = await sendForm<PurchaseView>("/api/purchase", fd);
      setForm(emptyForm(today));
      setFiles([]);
      setFileKey((k) => k + 1);
      flash(
        created.urgent
          ? `긴급 요청 '${created.part_name}'을(를) 등록했습니다. 1순위로 올라갔습니다.`
          : `'${created.part_name}' 요청을 등록했습니다. 맨 아래 순위로 들어갔으며, 관리자가 순서를 조정합니다.`
      );
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function move(id: number, body: { position: number } | { direction: "up" | "down" }) {
    run(async () => setItems(await apiPut<PurchaseView[]>(`/api/purchase/${id}/priority`, body)));
  }

  function drop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const pos = requestedAll.findIndex((i) => i.id === targetId) + 1;
    if (pos > 0) move(dragId, { position: pos });
  }

  function toggleSel(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const detailActions = (p: PurchaseView) => ({
    approve: () => setDialog({ kind: "approve", ids: [p.id] }),
    decline: () => setDialog({ kind: "decline", id: p.id }),
    receive: () => setDialog({ kind: "receive", id: p.id }),
    share: () => setDialog({ kind: "share", id: p.id, fresh: false }),
    reorder: () => reorder(p),
    revive: () => revive(p),
    remove: () => remove(p),
  });

  function reorder(p: PurchaseView) {
    run(async () => {
      await apiPost(`/api/purchase/${p.id}/reorder`, { entered_by: me });
      setDetailId(null);
      flash(`'${p.part_name}' 재요청을 등록했습니다. 구매요청 화면에서 확인하세요.`);
    });
  }

  function revive(p: PurchaseView) {
    run(async () => {
      await apiPut(`/api/purchase/${p.id}/revive`, { entered_by: me });
      flash(`'${p.part_name}'을(를) 다시 구매요청으로 올렸습니다.`);
    });
  }

  function remove(p: PurchaseView) {
    if (!confirm(`'${p.part_name}' 요청을 삭제할까요? 의견·첨부도 함께 지워집니다.`)) return;
    run(async () => {
      await apiDelete(`/api/purchase/${p.id}`, { entered_by: me });
      setDetailId(null);
      flash("삭제했습니다.");
    });
  }

  const exportUrl = `/api/purchase/export?stage=${current.status}&purpose=${encodeURIComponent(purposeFilter)}&q=${encodeURIComponent(q)}`;
  const selectedItems = requestedAll.filter((i) => selected.has(i.id));
  const allSelected = list.length > 0 && list.every((i) => selected.has(i.id));
  const chip = (key: QuickFilter, text: string) => (
    <button
      type="button"
      onClick={() => setQuick(quick === key ? "" : key)}
      className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${quick === key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"}`}
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">[구매발주]</h1>
        <p className="text-sm text-slate-500 mt-1">
          구매요청을 등록하면 관리자가 중요한 순서대로 정리해 승인(발주)하고, 물건이 들어오면 입고확인 후 생산부장님께 카톡으로 공유합니다.
        </p>
      </div>

      {!canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 요청 등록·입고확인은 입력 권한이 필요합니다.
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

      {!loading && today && <PurchaseDashboardTiles d={dashboard} active={quick} />}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex border-b overflow-x-auto px-2" role="tablist">
          {TABS.map((t) => {
            const n = counts[t.status as "requested" | "ordered" | "received"];
            const hot = (t.key === "request" && n > 0) || (t.key === "order" && dashboard.late > 0);
            return (
              <Link
                key={t.key}
                href={t.href}
                role="tab"
                aria-selected={t.key === tab}
                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-[3px] ${
                  t.key === tab ? "border-emerald-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-xs tabular-nums rounded-full px-1.5 ${hot ? "bg-red-500 text-white" : "bg-slate-100"}`}>{n}</span>
              </Link>
            );
          })}
        </div>

        {tab === "request" && canWrite && (
          <div className="bg-slate-50 border-b">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <h2 className="text-sm font-bold">새 구매요청</h2>
              <span className="text-xs text-slate-400">등록일은 자동으로 들어갑니다</span>
              <button type="button" onClick={() => toggleForm(!formOpen)} className={`${btn} ml-auto`}>
                {formOpen ? "접기" : "+ 요청 작성"}
              </button>
            </div>
            {formOpen && (
              <form onSubmit={submit} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-6 gap-2.5 items-end">
                <div className="col-span-2 md:col-span-1">
                  <EnteredByField value={enteredBy} onChange={setEnteredBy} error={nameError} lockedValue={session.loggedIn ? session.displayName : null} />
                </div>
                <label className="col-span-2 flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">
                    부품명 <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={form.part_name}
                    onChange={(e) => applyHistory(e.target.value)}
                    list="purchase-parts"
                    required
                    maxLength={100}
                    placeholder="예: 스크류 피더 베어링 6208ZZ"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">수량</span>
                  <div className="flex gap-1">
                    <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} inputMode="decimal" className={inputCls} />
                    <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="border rounded-md px-1 text-sm bg-white">
                      {!PURCHASE_UNITS.includes(form.unit) && <option>{form.unit}</option>}
                      {PURCHASE_UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">예상 일정</span>
                  <input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">예산(원)</span>
                  <input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} inputMode="numeric" placeholder="500000" className={inputCls} />
                </label>
                <label className="col-span-2 md:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">구입처</span>
                  <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} list="purchase-vendors" maxLength={60} placeholder="이전 구입처 자동완성" className={inputCls} />
                </label>
                <label className="col-span-2 md:col-span-1 flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">
                    사용목적 <span className="text-red-500">*</span>
                  </span>
                  <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as PurchasePurpose })} className={inputCls}>
                    {PURCHASE_PURPOSES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 md:col-span-3 flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">
                    사용처 · 목적 상세 <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={form.purpose_detail}
                    onChange={(e) => setForm({ ...form, purpose_detail: e.target.value })}
                    required
                    maxLength={300}
                    placeholder="예: 2호 건조기 버너 노즐 막힘으로 화염 불안정"
                    className={inputCls}
                  />
                </label>
                <div className="col-span-2 md:col-span-6 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400">자주 쓰는 문구:</span>
                  {PURCHASE_PURPOSES.filter((p) => PURPOSE_QUICK_TEXT[p]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, purpose: p, purpose_detail: PURPOSE_QUICK_TEXT[p]! })}
                      className="text-xs rounded-full border bg-white px-2.5 py-0.5 text-slate-600 hover:border-emerald-500"
                    >
                      {PURPOSE_QUICK_TEXT[p]}
                    </button>
                  ))}
                </div>
                <label className="col-span-2 md:col-span-6 flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">요청 의견 (선택) · 승인자에게 전할 내용</span>
                  <textarea
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    rows={2}
                    maxLength={1000}
                    placeholder="예: 예비품 없음, 다음 주 생산 전 교체 필요 / 견적 2곳 비교함"
                    className={inputCls}
                  />
                </label>
                <div className="col-span-2 md:col-span-6 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} />
                    <Pill tone="red">긴급</Pill>
                    <span className="text-xs text-slate-400">체크하면 1순위로 올라갑니다</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    📎 견적서·사진
                    <input
                      key={fileKey}
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                      className="text-xs max-w-[220px]"
                    />
                  </label>
                  {hint && (
                    <span className="text-xs text-sky-700">
                      지난 구매: {hint.order_date?.slice(0, 7)} · {hint.vendor || "구입처 미정"} · {won(hint.order_amount)}
                    </span>
                  )}
                  <button type="submit" disabled={saving} className="ml-auto bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40">
                    {saving ? "등록 중..." : "요청 등록"}
                  </button>
                </div>
                <datalist id="purchase-parts">
                  {partNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <datalist id="purchase-vendors">
                  {vendors.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </form>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="부품명·구입처·사용처 검색"
            className="border rounded-md px-2 py-1 text-sm w-full sm:w-56"
          />
          <select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value as "" | PurchasePurpose)} className="border rounded-md px-2 py-1 text-sm bg-white" aria-label="사용목적 필터">
            <option value="">사용목적 전체</option>
            {PURCHASE_PURPOSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          {tab === "request" && (
            <>
              {chip("urgent", "긴급만")}
              {chip("old", `${PURCHASE_WAIT_WARN_DAYS}일 이상 대기`)}
              <button
                type="button"
                onClick={() => setShowDeclined((v) => !v)}
                className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${showDeclined ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"}`}
              >
                반려·보류 보기 ({counts.declined})
              </button>
            </>
          )}
          {tab === "order" && (
            <>
              {chip("late", "지연만")}
              {chip("partial", "부분입고만")}
            </>
          )}
          {tab === "receive" && chip("unshared", "카톡 미공유만")}
          <span className="ml-auto text-xs text-slate-400">
            {tab === "request"
              ? isApprover
                ? "⠿ 끌기 · ▲▼ · 순위 숫자 누르기로 순서 변경 (맨 위가 1순위)"
                : "순서 변경과 승인은 관리자만 할 수 있습니다"
              : tab === "order"
                ? "입고예정일 빠른 순"
                : "최근 입고 순"}
          </span>
        </div>

        {tab === "request" && isApprover && selectedItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-emerald-50 border-b text-sm">
            <b>{selectedItems.length}건 선택</b>
            <span className="text-xs text-slate-500">예산 합계 {won(selectedItems.reduce((s, i) => s + i.budget, 0))}</span>
            <button type="button" onClick={() => setSelected(new Set())} className={`${btn} ml-auto`}>
              선택 해제
            </button>
            <button type="button" onClick={() => setDialog({ kind: "approve", ids: selectedItems.map((i) => i.id) })} className={btnPrimary}>
              선택 승인
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-slate-400 p-6">불러오는 중...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                {tab === "request" ? (
                  <tr>
                    {isApprover && (
                      <th className={th}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => setSelected(e.target.checked ? new Set(list.map((i) => i.id)) : new Set())}
                          aria-label="전체 선택"
                        />
                      </th>
                    )}
                    <th className={th}>순위</th>
                    {isApprover && <th className={th}>이동</th>}
                    <th className={th}>부품명 · 사용목적</th>
                    <th className={th}>수량</th>
                    <th className={th}>예상 일정</th>
                    <th className={`${th} text-right`}>예산</th>
                    <th className={th}>구입처</th>
                    <th className={th}>요청자</th>
                    <th className={th}>대기</th>
                    <th className={th}></th>
                  </tr>
                ) : tab === "order" ? (
                  <tr>
                    <th className={th}>부품명 · 사용목적</th>
                    <th className={th}>발주일</th>
                    <th className={th}>입고예정</th>
                    <th className={th}>상태</th>
                    <th className={th}>입고 수량</th>
                    <th className={`${th} text-right`}>발주금액</th>
                    <th className={th}>예산 대비</th>
                    <th className={th}>구입처</th>
                    <th className={th}></th>
                  </tr>
                ) : (
                  <tr>
                    <th className={th}>부품명 · 사용목적</th>
                    <th className={th}>입고일</th>
                    <th className={th}>예정일 대비</th>
                    <th className={th}>수량</th>
                    <th className={`${th} text-right`}>발주금액</th>
                    <th className={th}>예산 대비</th>
                    <th className={th}>구입처</th>
                    <th className={th}>카톡</th>
                    <th className={th}></th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y">
                {list.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-sm text-slate-400 px-4 py-8 text-center">
                      {tab === "request" ? "승인 대기 중인 구매요청이 없습니다." : tab === "order" ? "진행 중인 발주가 없습니다." : "입고된 건이 없습니다."}
                    </td>
                  </tr>
                )}
                {tab === "request" &&
                  list.map((p) => {
                    const rank = requestedAll.indexOf(p) + 1;
                    return (
                      <tr
                        key={p.id}
                        draggable={isApprover && !busy}
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (dragId === null) return;
                          e.preventDefault();
                          setDragOver(p.id);
                        }}
                        onDragLeave={() => setDragOver((v) => (v === p.id ? null : v))}
                        onDrop={(e) => {
                          e.preventDefault();
                          drop(p.id);
                          setDragId(null);
                          setDragOver(null);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOver(null);
                        }}
                        className={`${dragId === p.id ? "opacity-40" : ""} ${dragOver === p.id && dragId !== p.id ? "shadow-[inset_0_2px_0_#059669]" : ""} hover:bg-slate-50`}
                      >
                        {isApprover && (
                          <td className={td}>
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} aria-label="선택" />
                          </td>
                        )}
                        <td className={td}>
                          <RankCell rank={rank} total={requestedAll.length} disabled={!isApprover || busy} onMove={(n) => move(p.id, { position: n })} />
                        </td>
                        {isApprover && (
                          <td className={td}>
                            <div className="flex items-center gap-1">
                              <span className="cursor-grab text-slate-400 select-none" title="끌어서 순서 변경" aria-hidden>
                                ⠿
                              </span>
                              <div className="flex flex-col gap-0.5">
                                <button type="button" disabled={rank <= 1 || busy} onClick={() => move(p.id, { direction: "up" })} className="w-6 h-4 border rounded text-[10px] leading-none bg-white disabled:opacity-30" aria-label="위로">
                                  ▲
                                </button>
                                <button type="button" disabled={rank >= requestedAll.length || busy} onClick={() => move(p.id, { direction: "down" })} className="w-6 h-4 border rounded text-[10px] leading-none bg-white disabled:opacity-30" aria-label="아래로">
                                  ▼
                                </button>
                              </div>
                              <MoveMenu rank={rank} total={requestedAll.length} disabled={busy} onMove={(n) => move(p.id, { position: n })} />
                            </div>
                          </td>
                        )}
                        <NameCell p={p} onOpen={() => setDetailId(p.id)} />
                        <td className={`${td} tabular-nums`}>
                          {fmtQty(p.qty)} {p.unit}
                        </td>
                        <td className={td}>{md(p.expected_date)}</td>
                        <td className={`${td} text-right tabular-nums`}>{won(p.budget)}</td>
                        <td className={td}>{p.vendor || "-"}</td>
                        <td className={`${td} text-xs text-slate-500`}>{p.requested_by}</td>
                        <td className={td}>
                          <WaitPill p={p} today={today} />
                        </td>
                        <td className={td}>
                          {isApprover ? (
                            <div className="flex gap-1">
                              <button type="button" disabled={busy} onClick={() => setDialog({ kind: "approve", ids: [p.id] })} className={btnPrimary}>
                                승인
                              </button>
                              <button type="button" disabled={busy} onClick={() => setDialog({ kind: "decline", id: p.id })} className={btnRed}>
                                반려·보류
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setDetailId(p.id)} className={btn}>
                              의견 보기
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {tab === "request" &&
                  showDeclined &&
                  declined.map((p) => (
                    <tr key={p.id} className="bg-slate-50/60 text-slate-500">
                      {isApprover && <td className={td}></td>}
                      <td className={td}>
                        <Pill tone={p.status === "on_hold" ? "amber" : "slate"}>{p.status === "on_hold" ? "보류" : "반려"}</Pill>
                      </td>
                      {isApprover && <td className={td}></td>}
                      <NameCell p={p} onOpen={() => setDetailId(p.id)} />
                      <td className={`${td} tabular-nums`}>
                        {fmtQty(p.qty)} {p.unit}
                      </td>
                      <td className={td}>{md(p.expected_date)}</td>
                      <td className={`${td} text-right tabular-nums`}>{won(p.budget)}</td>
                      <td className={td}>{p.vendor || "-"}</td>
                      <td className={`${td} text-xs`}>{p.requested_by}</td>
                      <td className={td}></td>
                      <td className={td}>
                        {canWrite && (isApprover || p.requested_by === me) && (
                          <button type="button" disabled={busy} onClick={() => revive(p)} className={btn}>
                            다시 요청
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                {tab === "order" &&
                  list.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <NameCell p={p} onOpen={() => setDetailId(p.id)} />
                      <td className={td}>{md(p.order_date)}</td>
                      <td className={td}>{md(p.eta)}</td>
                      <td className={td}>
                        <EtaPill p={p} today={today} />
                      </td>
                      <td className={td}>
                        {p.received_qty > 0 ? (
                          <Pill tone="sky">
                            부분입고 {fmtQty(p.received_qty)}/{fmtQty(p.qty)}
                          </Pill>
                        ) : (
                          <span className="text-xs text-slate-500">
                            0/{fmtQty(p.qty)} {p.unit}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{won(p.order_amount)}</td>
                      <td className={td}>
                        <BudgetDiff amount={p.order_amount} budget={p.budget} />
                      </td>
                      <td className={td}>{p.vendor || "-"}</td>
                      <td className={td}>
                        {canWrite && (
                          <button type="button" disabled={busy} onClick={() => setDialog({ kind: "receive", id: p.id })} className={btnPrimary}>
                            입고확인
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                {tab === "receive" &&
                  list.map((p) => {
                    const diff = p.received_date && p.eta ? daysBetween(p.eta, p.received_date) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <NameCell p={p} onOpen={() => setDetailId(p.id)} />
                        <td className={td}>{md(p.received_date)}</td>
                        <td className={td}>
                          {diff > 0 ? <Pill tone="red">{diff}일 늦음</Pill> : diff < 0 ? <Pill tone="green">{-diff}일 빠름</Pill> : <Pill tone="green">정시</Pill>}
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {fmtQty(p.qty)} {p.unit}
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{won(p.order_amount)}</td>
                        <td className={td}>
                          <BudgetDiff amount={p.order_amount} budget={p.budget} />
                        </td>
                        <td className={td}>{p.vendor || "-"}</td>
                        <td className={td}>
                          {p.kakao_shared_at ? (
                            <span className="flex items-center gap-1">
                              <Pill tone="green">공유됨</Pill>
                              {canWrite && (
                                <button type="button" onClick={() => setDialog({ kind: "share", id: p.id, fresh: false })} className={btn}>
                                  다시
                                </button>
                              )}
                            </span>
                          ) : (
                            canWrite && (
                              <button type="button" onClick={() => setDialog({ kind: "share", id: p.id, fresh: false })} className={btnKakao}>
                                카톡 공유
                              </button>
                            )
                          )}
                        </td>
                        <td className={td}>
                          {canWrite && (
                            <button type="button" disabled={busy} onClick={() => reorder(p)} className={btn} title="같은 품목·구입처·금액으로 새 요청">
                              재요청
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              {list.length > 0 && (
                <tfoot className="bg-slate-50 border-t font-semibold">
                  <tr>
                    <td className={td} colSpan={tab === "request" ? (isApprover ? 6 : 4) : tab === "order" ? 5 : 4}>
                      합계 {list.length}건
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {won(list.reduce((s, i) => s + (tab === "request" ? i.budget : i.order_amount ?? 0), 0))}
                    </td>
                    <td className={td} colSpan={4}>
                      {tab !== "request" && (
                        <BudgetDiff amount={list.reduce((s, i) => s + (i.order_amount ?? 0), 0)} budget={list.reduce((s, i) => s + i.budget, 0)} />
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {!loading && today && <PurchaseStats items={items} today={today} monthBudget={dashboard.monthBudget} exportUrl={exportUrl} />}

      {detail && (
        <PurchaseDetail
          key={detail.id}
          item={detail}
          today={today}
          me={me}
          isApprover={isApprover}
          canWrite={canWrite}
          busy={busy}
          onClose={() => setDetailId(null)}
          onChanged={flash}
          actions={detailActions(detail)}
        />
      )}

      {dialog?.kind === "approve" && (
        <ApproveDialog
          items={items.filter((i) => dialog.ids.includes(i.id) && i.status === "requested")}
          today={today}
          me={me}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            setDetailId(null);
            setSelected(new Set());
            flash(msg);
          }}
        />
      )}
      {dialog?.kind === "decline" && dialogItem && (
        <DeclineDialog
          item={dialogItem}
          me={me}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            setDetailId(null);
            flash(msg);
          }}
        />
      )}
      {dialog?.kind === "receive" && dialogItem && (
        <ReceiveDialog
          item={dialogItem}
          today={today}
          me={me}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            if (updated.status === "received") {
              setDetailId(null);
              setDialog({ kind: "share", id: updated.id, fresh: true });
              setMessage(`'${updated.part_name}' 입고완료되었습니다.`);
            } else {
              setDialog(null);
              setMessage(`부분입고 기록: ${fmtQty(updated.received_qty)}/${fmtQty(updated.qty)} ${updated.unit} · 나머지는 계속 추적합니다.`);
            }
            load();
          }}
        />
      )}
      {dialog?.kind === "share" && dialogItem && (
        <ShareDialog
          item={dialogItem}
          me={me}
          fresh={dialog.fresh}
          onClose={() => setDialog(null)}
          onShared={(msg) => {
            setDialog(null);
            flash(msg);
          }}
        />
      )}
    </div>
  );
}
