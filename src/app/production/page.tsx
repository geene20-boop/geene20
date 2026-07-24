"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { ProductionLog, Worker } from "@/lib/types";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { useSiteSession } from "@/lib/useSiteSession";

export const PRODUCT_OPTIONS = ["입상규산", "석회고토", "칼슘유황"];
export const GRANULATION_AGENT_OPTIONS = ["당밀계열", "전분계열", "CMC계열"];

type FormState = {
  date: string;
  shift: "주" | "야";
  product: string;
  daily_pack_amount: string;
  worker: string;
  dryer_temp_a: string;
  dryer_temp_b: string;
  feed_hopper_a: string;
  feed_hopper_b: string;
  feed_fine_powder: string;
  feed_mixer: string;
  feed_molder: string;
  brix: string;
  granulation_agent: string;
  line_hours_a: string;
  line_hours_b: string;
  downtime_hours: string;
  downtime_reason: string;
  lng_dryer: string;
  lng_rto: string;
  carryover_dryer: string;
  carryover_rto: string;
  moisture_manual: string;
  hardness_manual: string;
  note: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const emptyForm: FormState = {
  date: today(),
  shift: "주",
  product: "",
  daily_pack_amount: "",
  worker: "",
  dryer_temp_a: "",
  dryer_temp_b: "",
  feed_hopper_a: "",
  feed_hopper_b: "",
  feed_fine_powder: "",
  feed_mixer: "",
  feed_molder: "",
  brix: "",
  granulation_agent: "",
  line_hours_a: "",
  line_hours_b: "",
  downtime_hours: "",
  downtime_reason: "",
  lng_dryer: "",
  lng_rto: "",
  carryover_dryer: "",
  carryover_rto: "",
  moisture_manual: "",
  hardness_manual: "",
  note: "",
};

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

function toFormValue(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

function fromLog(row: ProductionLog): FormState {
  return {
    date: row.date,
    shift: row.shift,
    product: row.product ?? "",
    daily_pack_amount: toFormValue(row.daily_pack_amount),
    worker: row.worker ?? "",
    dryer_temp_a: toFormValue(row.dryer_temp_a),
    dryer_temp_b: toFormValue(row.dryer_temp_b),
    feed_hopper_a: toFormValue(row.feed_hopper_a),
    feed_hopper_b: toFormValue(row.feed_hopper_b),
    feed_fine_powder: toFormValue(row.feed_fine_powder),
    feed_mixer: toFormValue(row.feed_mixer),
    feed_molder: toFormValue(row.feed_molder),
    brix: toFormValue(row.brix),
    granulation_agent: row.granulation_agent ?? "",
    line_hours_a: toFormValue(row.line_hours_a),
    line_hours_b: toFormValue(row.line_hours_b),
    downtime_hours: toFormValue(row.downtime_hours),
    downtime_reason: row.downtime_reason ?? "",
    lng_dryer: toFormValue(row.lng_dryer),
    lng_rto: toFormValue(row.lng_rto),
    carryover_dryer: toFormValue(row.carryover_dryer),
    carryover_rto: toFormValue(row.carryover_rto),
    moisture_manual: toFormValue(row.moisture_manual),
    hardness_manual: toFormValue(row.hardness_manual),
    note: row.note ?? "",
  };
}

function Field({
  label,
  value,
  onChange,
  type = "number",
  placeholder,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  list?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        step="any"
        list={list}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const allOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        <option value="">선택 안 함</option>
        {allOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border rounded-lg p-4">
      <legend className="text-sm font-semibold text-slate-700 px-1">{title}</legend>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">{children}</div>
    </fieldset>
  );
}

export default function ProductionPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [qcRef, setQcRef] = useState<{ hardness: number | null; moisture: number | null; brix: number | null }>({
    hardness: null,
    moisture: null,
    brix: null,
  });
  const [packingRef, setPackingRef] = useState<{
    configured: boolean;
    tonQty: number | null;
    bagPackQty: number;
    bagPackCount: number;
  } | null>(null);
  const [packingEntryRef, setPackingEntryRef] = useState<{
    totalTons: number;
    suggestedProduct: string | null;
  } | null>(null);
  const [carryoverPreview, setCarryoverPreview] = useState<{ dryer: number | null; rto: number | null }>({
    dryer: null,
    rto: null,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const session = useSiteSession();
  const [tab, setTab] = useState<"condition" | "material" | "log">("condition");

  useEffect(() => {
    if (session.loggedIn && session.displayName) {
       
      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [carryoverUnlocked, setCarryoverUnlocked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pendingUnlock, setPendingUnlock] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState<FormState | null>(null);
  const draftKey = `production_draft_${form.date}_${form.shift}`;
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    apiGet<Worker[]>("/api/worker").then(setWorkers);
  }, []);

  useEffect(() => {
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feedTotal = useMemo(() => {
    const a = n(form.feed_mixer) ?? 0;
    const b = n(form.feed_molder) ?? 0;
    return a + b;
  }, [form.feed_mixer, form.feed_molder]);

  const lineHoursTotal = useMemo(() => {
    const a = n(form.line_hours_a) ?? 0;
    const b = n(form.line_hours_b) ?? 0;
    const downtime = n(form.downtime_hours) ?? 0;
    return Math.max(0, a + b - downtime);
  }, [form.line_hours_a, form.line_hours_b, form.downtime_hours]);

  const dryerReal = useMemo(() => {
    const dryer = n(form.lng_dryer);
    const carry = n(form.carryover_dryer);
    return dryer != null && carry != null ? dryer - carry : null;
  }, [form.lng_dryer, form.carryover_dryer]);

  const rtoReal = useMemo(() => {
    const rto = n(form.lng_rto);
    const carry = n(form.carryover_rto);
    return rto != null && carry != null ? rto - carry : null;
  }, [form.lng_rto, form.carryover_rto]);

  // 전날(직전 교대)의 실제 누계값과 이 기록에 저장된 전일재고가 다른지 확인.
  // 직전 교대 기록 자체가 없으면(즉 이 조가 가장 첫 기록이면) 비교하지 않는다.
  const dryerCarryMismatch = useMemo(() => {
    if (carryoverPreview.dryer == null) return false;
    const carry = n(form.carryover_dryer);
    return carry != null && carry !== carryoverPreview.dryer;
  }, [carryoverPreview.dryer, form.carryover_dryer]);

  const rtoCarryMismatch = useMemo(() => {
    if (carryoverPreview.rto == null) return false;
    const carry = n(form.carryover_rto);
    return carry != null && carry !== carryoverPreview.rto;
  }, [carryoverPreview.rto, form.carryover_rto]);

  // 제품포장(packing_entry)에 입력된 그날 실제 포장량과 이 기록의 일일포장량이 다른지 확인
  const packAmountMismatch = useMemo(() => {
    if (!packingEntryRef || packingEntryRef.totalTons <= 0) return false;
    const amount = n(form.daily_pack_amount);
    return amount != null && amount !== packingEntryRef.totalTons;
  }, [packingEntryRef, form.daily_pack_amount]);

  const gasUsageShift = useMemo(() => {
    if (dryerReal == null && rtoReal == null) return null;
    return (dryerReal ?? 0) + (rtoReal ?? 0);
  }, [dryerReal, rtoReal]);

  const [logsDate, setLogsDate] = useState(today());

  async function loadLogs() {
    const rows = await apiGet<ProductionLog[]>(`/api/production?from=${logsDate}&to=${logsDate}`);
    setLogs(rows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsDate]);

  // 날짜/조가 바뀌면 화면에 필요한 참고정보(기존기록/전일재고/QC평균/포장일지)를
  // 단일 API 호출로 한 번에 받아온다
  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      const ctx = await apiGet<{
        existing: ProductionLog | null;
        carryoverPreview: { dryer: number | null; rto: number | null };
        qcRef: { hardness: number | null; moisture: number | null; brix: number | null };
        packingRef: { configured: boolean; tonQty: number | null; bagPackQty: number; bagPackCount: number };
        packingEntryRef: { totalTons: number; suggestedProduct: string | null };
      }>(`/api/production/context?date=${form.date}&shift=${form.shift}`);
      if (cancelled) return;

      setCarryoverUnlocked(false);
      setQcRef(ctx.qcRef);
      setPackingRef(ctx.packingRef.configured ? ctx.packingRef : null);
      setPackingEntryRef(ctx.packingEntryRef);
      setCarryoverPreview(ctx.carryoverPreview);

      if (ctx.existing) {
        setCurrentId(ctx.existing.id);
        setLocked(!!ctx.existing.locked);
        setForm((f) => ({ ...fromLog(ctx.existing as ProductionLog), date: f.date, shift: f.shift }));
        setMaintenanceMode(!!ctx.existing.note?.startsWith("정비"));
      } else {
        setCurrentId(null);
        setLocked(false);
        setForm((f) => ({
          ...emptyForm,
          date: f.date,
          shift: f.shift,
          carryover_dryer: toFormValue(ctx.carryoverPreview?.dryer),
          carryover_rto: toFormValue(ctx.carryoverPreview?.rto),
          daily_pack_amount:
            ctx.packingEntryRef.totalTons > 0 ? String(ctx.packingEntryRef.totalTons) : "",
          product: ctx.packingEntryRef.suggestedProduct ?? "",
        }));
        setMaintenanceMode(false);
      }
      setDirty(false);

      try {
        const saved = localStorage.getItem(`production_draft_${form.date}_${form.shift}`);
        setDraftAvailable(saved ? (JSON.parse(saved) as FormState) : null);
      } catch {
        setDraftAvailable(null);
      }
    }
    loadContext();
    return () => {
      cancelled = true;
    };
  }, [form.date, form.shift]);

  // 입력 중인 내용을 잠깐 멈춘 사이(0.8초) 브라우저에 임시 저장 - 저장 안 하고 나가도 복구 가능
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(form));
      } catch {
        // localStorage 사용 불가 시 조용히 무시
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function restoreDraft() {
    if (!draftAvailable) return;
    setForm(draftAvailable);
    setDraftAvailable(null);
    setDirty(true);
  }

  function discardDraft() {
    localStorage.removeItem(draftKey);
    setDraftAvailable(null);
  }

  function requestCarryoverEdit() {
    if (admin.loggedIn) {
      setCarryoverUnlocked(true);
    } else {
      setShowAdminModal(true);
    }
  }

  // 확정: 기존 데이터를 실수로 덮어쓰는 걸 막기 위해, 저장된 기록을 잠근다.
  // 잠근 뒤에는 관리자 로그인 후 해제해야만 다시 수정할 수 있다.
  async function onConfirmLock() {
    if (currentId == null) return;
    if (
      !confirm(
        "이 날짜/조 기록을 확정할까요? 확정 후에는 관리자 로그인 후 해제하기 전까지 수정할 수 없습니다."
      )
    )
      return;
    const updated = await apiPut<ProductionLog>(`/api/production/${currentId}/lock`, {
      locked: true,
      entered_by: enteredBy.trim(),
    });
    setLocked(!!updated.locked);
    loadLogs();
  }

  async function unlockNow() {
    if (currentId == null) return;
    // 관리자 로그인 직후 곧바로 호출될 수 있어(입력자명 state가 아직 갱신되기 전),
    // 서버에 방금 로그인한 관리자 이름을 직접 물어봐서 사용한다.
    const adminSession = await fetch("/api/admin/session").then((r) => r.json());
    const actorName = adminSession.name || enteredBy.trim();
    if (!actorName) return;
    const updated = await apiPut<ProductionLog>(`/api/production/${currentId}/lock`, {
      locked: false,
      entered_by: actorName,
    });
    setLocked(!!updated.locked);
    loadLogs();
  }

  function requestUnlock() {
    if (admin.loggedIn) {
      unlockNow();
    } else {
      setPendingUnlock(true);
      setShowAdminModal(true);
    }
  }

  // 예방/돌발 정비로 생산이 없었던 날: 모든 칸을 비우되, LNG 누계만 전일재고와 동일하게
  // 채워서 실사용량이 0으로 계산되게 한다.
  function onMaintenanceDay() {
    setForm((f) => ({
      ...emptyForm,
      date: f.date,
      shift: f.shift,
      carryover_dryer: toFormValue(carryoverPreview.dryer),
      carryover_rto: toFormValue(carryoverPreview.rto),
      lng_dryer: toFormValue(carryoverPreview.dryer),
      lng_rto: toFormValue(carryoverPreview.rto),
      note: "정비",
    }));
    setMaintenanceMode(true);
    setDirty(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        date: form.date,
        shift: form.shift,
        product: form.product || null,
        daily_pack_amount: n(form.daily_pack_amount),
        worker: form.worker || null,
        entered_by: enteredBy.trim(),
        dryer_temp_a: n(form.dryer_temp_a),
        dryer_temp_b: n(form.dryer_temp_b),
        feed_hopper_a: n(form.feed_hopper_a),
        feed_hopper_b: n(form.feed_hopper_b),
        feed_fine_powder: n(form.feed_fine_powder),
        feed_mixer: n(form.feed_mixer),
        feed_molder: n(form.feed_molder),
        brix: n(form.brix),
        granulation_agent: form.granulation_agent || null,
        line_hours_a: n(form.line_hours_a),
        line_hours_b: n(form.line_hours_b),
        downtime_hours: n(form.downtime_hours),
        downtime_reason: n(form.downtime_hours) ? form.downtime_reason || null : null,
        lng_dryer: n(form.lng_dryer),
        lng_rto: n(form.lng_rto),
        moisture_manual: n(form.moisture_manual),
        hardness_manual: n(form.hardness_manual),
        note: form.note || null,
      };
      if (carryoverUnlocked) {
        body.carryOverride = true;
        body.carryover_dryer = n(form.carryover_dryer);
        body.carryover_rto = n(form.carryover_rto);
      }
      const saved = await apiPost<ProductionLog>("/api/production", body);
      setMessage("저장되었습니다.");
      setCurrentId(saved.id);
      setForm((f) => ({ ...fromLog(saved), date: f.date, shift: f.shift }));
      setCarryoverUnlocked(false);
      setDirty(false);
      localStorage.removeItem(draftKey);
      loadLogs();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!enteredBy.trim()) {
      alert("삭제하려면 먼저 입력자명을 입력해주세요.");
      return;
    }
    if (!confirm("이 생산일지 항목을 삭제할까요?")) return;
    await apiDelete(`/api/production/${id}`, { entered_by: enteredBy.trim() });
    loadLogs();
    if (id === currentId) {
      setCurrentId(null);
      setForm((f) => ({ ...emptyForm, date: f.date, shift: f.shift }));
      setMaintenanceMode(false);
    }
  }

  const contentLocked = !session.canWrite || locked;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">생산일지 입력</h1>
          <p className="text-sm text-slate-500 mt-1">
            교대(주/야)별 설비가동정보를 입력합니다. 날짜를 이동하면 그 날짜/조에 이미 기록이 있는
            경우 자동으로 불러와 조회·수정할 수 있습니다.
          </p>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          {admin.loggedIn ? (
            <>
              <span className="text-emerald-600 font-medium">관리자 로그인됨</span>
              <button type="button" className="underline" onClick={() => admin.logout()}>
                로그아웃
              </button>
            </>
          ) : (
            <button type="button" className="underline" onClick={() => setShowAdminModal(true)}>
              관리자 로그인
            </button>
          )}
        </div>
      </div>

      {showAdminModal && (
        <AdminLoginModal
          onClose={() => {
            setShowAdminModal(false);
            setPendingUnlock(false);
          }}
          onSuccess={() => {
            admin.setLoggedIn(true);
            session.refresh();
            setCarryoverUnlocked(true);
            setShowAdminModal(false);
            if (pendingUnlock) {
              setPendingUnlock(false);
              unlockNow();
            }
          }}
        />
      )}

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 입력·수정은 editor 권한이 필요합니다.
        </div>
      )}

      {currentId != null && locked && (
        <div className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md px-3 py-2">
          <span>
            🔒 확정됨 ({form.date} {form.shift}조) — 이 기록은 확정되어 수정할 수 없습니다.
          </span>
          <button type="button" onClick={requestUnlock} className="underline font-medium">
            관리자 로그인 후 해제
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "condition", label: "생산조건" },
            { key: "material", label: "원료조건" },
            { key: "log", label: "생산일지 조회" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "condition" || tab === "material") && (
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 bg-white rounded-xl border p-5"
      >
        {tab === "condition" && (
        <>
        <label className="flex flex-col gap-1 text-sm w-fit">
          <span className="text-slate-600">날짜</span>
          <div className="flex gap-1">
            <button
              type="button"
              className="border rounded-md px-2 text-xs"
              onClick={() => set("date", shiftDate(form.date, -1))}
            >
              ◀ 전날
            </button>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="border rounded-md px-2 py-1.5 flex-1 min-w-0"
            />
            <button
              type="button"
              className="border rounded-md px-2 text-xs"
              onClick={() => set("date", shiftDate(form.date, 1))}
            >
              다음날 ▶
            </button>
          </div>
        </label>

        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${contentLocked ? "opacity-50 pointer-events-none" : ""}`}>
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">조 / 작업자</span>
            <div className="flex gap-2">
              <select
                value={form.shift}
                onChange={(e) => set("shift", e.target.value as "주" | "야")}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="주">주간조</option>
                <option value="야">야간조</option>
              </select>
              <select
                value={form.worker}
                onChange={(e) => set("worker", e.target.value)}
                className="border rounded-md px-2 py-1.5 flex-1 min-w-0"
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
            </div>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <SelectField label="생산품목 (제품포장 자동 분류)" value={form.product} onChange={(v) => set("product", v)} options={PRODUCT_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className={`flex items-center gap-1 ${packAmountMismatch ? "text-red-600 font-medium" : "text-slate-600"}`}>
              일일포장량(ton) (제품포장 자동 반영)
              {packingRef?.tonQty != null && ` (포장일지 참고: ${packingRef.tonQty}톤)`}
            </span>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                value={form.daily_pack_amount}
                onChange={(e) => set("daily_pack_amount", e.target.value)}
                className={`border rounded-md px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  packAmountMismatch ? "text-red-600 font-medium" : ""
                }`}
              />
              {packingEntryRef && packingEntryRef.totalTons > 0 && (
                <button
                  type="button"
                  onClick={() => set("daily_pack_amount", String(packingEntryRef.totalTons))}
                  className="text-xs border border-slate-300 rounded-md px-2 whitespace-nowrap"
                >
                  제품포장값 적용
                </button>
              )}
              {packingRef?.tonQty != null && (
                <button
                  type="button"
                  onClick={() => set("daily_pack_amount", String(packingRef.tonQty))}
                  className="text-xs border border-slate-300 rounded-md px-2 whitespace-nowrap"
                >
                  가져오기
                </button>
              )}
            </div>
            {packAmountMismatch && (
              <span className="text-[11px] text-red-600">
                제품포장에 입력된 그날 포장량({packingEntryRef!.totalTons}톤)과 다릅니다.
              </span>
            )}
            {packingRef && packingRef.bagPackCount > 0 && (
              <span className="text-[11px] text-amber-600">
                포 단위 포장 {packingRef.bagPackCount}건({packingRef.bagPackQty}포)은 톤 환산이 안 되어
                제외됨
              </span>
            )}
          </div>
        </div>

        <div className={`flex flex-col gap-4 ${contentLocked ? "opacity-50 pointer-events-none" : ""}`}>
        {currentId != null && (
          <p className="text-xs text-sky-600 bg-sky-50 border border-sky-200 rounded-md px-3 py-1.5 w-fit">
            이 날짜/조는 기존에 저장된 기록을 불러왔습니다 (ID {currentId}). 저장하면 덮어씁니다.
          </p>
        )}
        {draftAvailable && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-3 w-fit">
            <span>저장하지 않고 나갔던 임시 입력 내용이 있습니다.</span>
            <button type="button" onClick={restoreDraft} className="underline font-medium">
              불러오기
            </button>
            <button type="button" onClick={discardDraft} className="underline text-slate-500">
              삭제
            </button>
          </div>
        )}

        <Section title="건조로 셋팅 온도 (℃)">
          <Field label="A라인" value={form.dryer_temp_a} onChange={(v) => set("dryer_temp_a", v)} />
          <Field label="B라인" value={form.dryer_temp_b} onChange={(v) => set("dryer_temp_b", v)} />
        </Section>

        <Section title="라인 가동 시간 (Hr)">
          <Field label="A라인" value={form.line_hours_a} onChange={(v) => set("line_hours_a", v)} />
          <Field label="B라인" value={form.line_hours_b} onChange={(v) => set("line_hours_b", v)} />
          <Field label="비가동시간" value={form.downtime_hours} onChange={(v) => set("downtime_hours", v)} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">A+B 합계 - 비가동 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">{lineHoursTotal.toFixed(2)}</div>
          </div>
          {(n(form.downtime_hours) ?? 0) > 0 && (
            <label className="flex flex-col gap-1 text-sm col-span-2 md:col-span-4">
              <span className="text-amber-700 font-medium">비가동발생원인</span>
              <input
                type="text"
                value={form.downtime_reason}
                onChange={(e) => set("downtime_reason", e.target.value)}
                placeholder="예: 설비 점검, 원료 공급 지연 등"
                className="border rounded-md px-2 py-1.5 border-amber-400 bg-amber-50"
              />
            </label>
          )}
        </Section>

        <label className="flex flex-col gap-1 text-sm">
          <span className={maintenanceMode ? "text-amber-700 font-medium" : "text-slate-600"}>
            {maintenanceMode ? "정비내역" : "비고"}
          </span>
          <textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={`border rounded-md px-2 py-1.5 ${
              maintenanceMode ? "border-amber-400 bg-amber-50" : ""
            }`}
            rows={2}
            placeholder={maintenanceMode ? "정비 내용을 입력하세요 (예: 압출기 스크류 교체)" : undefined}
          />
        </label>
        </div>
        </>
        )}

        {tab === "material" && (
        <>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm w-fit">
            <span className="text-slate-600">날짜</span>
            <div className="flex gap-1">
              <button
                type="button"
                className="border rounded-md px-2 text-xs"
                onClick={() => set("date", shiftDate(form.date, -1))}
              >
                ◀ 전날
              </button>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="border rounded-md px-2 py-1.5 flex-1 min-w-0"
              />
              <button
                type="button"
                className="border rounded-md px-2 text-xs"
                onClick={() => set("date", shiftDate(form.date, 1))}
              >
                다음날 ▶
              </button>
            </div>
          </label>
          <div className={`flex flex-wrap items-end gap-3 ${contentLocked ? "opacity-50 pointer-events-none" : ""}`}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">조</span>
              <select
                value={form.shift}
                onChange={(e) => set("shift", e.target.value as "주" | "야")}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="주">주간조</option>
                <option value="야">야간조</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">작업자</span>
              <select
                value={form.worker}
                onChange={(e) => set("worker", e.target.value)}
                className="border rounded-md px-2 py-1.5 min-w-[120px]"
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
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">생산품목</span>
              <div className="border rounded-md px-3 py-1.5 bg-slate-50 text-slate-600 min-w-[100px]">
                {form.product || "-"}
              </div>
            </div>
          </div>
        </div>

        <div className={`flex flex-col gap-4 ${contentLocked ? "opacity-50 pointer-events-none" : ""}`}>
        <Section title="원료 피딩 조건 (Hz)">
          <Field label="A호퍼" value={form.feed_hopper_a} onChange={(v) => set("feed_hopper_a", v)} />
          <Field label="B호퍼" value={form.feed_hopper_b} onChange={(v) => set("feed_hopper_b", v)} />
          <Field label="A/B미분" value={form.feed_fine_powder} onChange={(v) => set("feed_fine_powder", v)} />
        </Section>

        <Section title="조립제 투입 단위 (ℓ/분)">
          <SelectField
            label="조립제"
            value={form.granulation_agent}
            onChange={(v) => set("granulation_agent", v)}
            options={GRANULATION_AGENT_OPTIONS}
          />
          <Field label="혼합기" value={form.feed_mixer} onChange={(v) => set("feed_mixer", v)} />
          <Field label="성형기" value={form.feed_molder} onChange={(v) => set("feed_molder", v)} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">합계 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">{feedTotal.toFixed(2)}</div>
          </div>
          <Field
            label={`조립제 Brix${qcRef.brix != null ? ` (QC평균 참고: ${qcRef.brix.toFixed(2)})` : ""}`}
            value={form.brix}
            onChange={(v) => set("brix", v)}
          />
        </Section>

        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-semibold text-slate-700 px-1">LNG 사용량 (㎥)</legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            <Field label="건조로 누계 (이번 조)" value={form.lng_dryer} onChange={(v) => set("lng_dryer", v)} />
            <Field label="RTO 누계 (이번 조)" value={form.lng_rto} onChange={(v) => set("lng_rto", v)} />
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">가동시간당 사용량 (자동)</span>
              <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
                {lineHoursTotal > 0 && gasUsageShift != null ? (gasUsageShift / lineHoursTotal).toFixed(1) : "-"}
              </div>
            </div>
            <div />

            <label className="flex flex-col gap-1 text-sm">
              <span
                className={`flex items-center gap-1 ${dryerCarryMismatch ? "text-red-600 font-medium" : "text-slate-600"}`}
              >
                전일재고 - 건조로 누계
                {carryoverUnlocked ? (
                  <span className="text-[11px] text-emerald-600 font-normal">(수정 가능)</span>
                ) : (
                  <button type="button" onClick={requestCarryoverEdit} className="text-[11px] underline text-sky-600">
                    수정
                  </button>
                )}
              </span>
              <input
                type="number"
                step="any"
                value={form.carryover_dryer}
                disabled={!carryoverUnlocked}
                onChange={(e) => set("carryover_dryer", e.target.value)}
                className={`border rounded-md px-2 py-1.5 disabled:bg-slate-50 ${
                  dryerCarryMismatch
                    ? "text-red-600 font-medium"
                    : carryoverUnlocked
                      ? "border-emerald-300 bg-emerald-50"
                      : "disabled:text-slate-500"
                }`}
              />
              {dryerCarryMismatch && (
                <span className="text-[11px] text-red-500">
                  전날 실제 건조로 누계({carryoverPreview.dryer})와 다릅니다.
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span
                className={`flex items-center gap-1 ${rtoCarryMismatch ? "text-red-600 font-medium" : "text-slate-600"}`}
              >
                전일재고 - RTO 누계
                {carryoverUnlocked ? (
                  <span className="text-[11px] text-emerald-600 font-normal">(수정 가능)</span>
                ) : (
                  <button type="button" onClick={requestCarryoverEdit} className="text-[11px] underline text-sky-600">
                    수정
                  </button>
                )}
              </span>
              <input
                type="number"
                step="any"
                value={form.carryover_rto}
                disabled={!carryoverUnlocked}
                onChange={(e) => set("carryover_rto", e.target.value)}
                className={`border rounded-md px-2 py-1.5 disabled:bg-slate-50 ${
                  rtoCarryMismatch
                    ? "text-red-600 font-medium"
                    : carryoverUnlocked
                      ? "border-emerald-300 bg-emerald-50"
                      : "disabled:text-slate-500"
                }`}
              />
              {rtoCarryMismatch && (
                <span className="text-[11px] text-red-500">
                  전날 실제 RTO 누계({carryoverPreview.rto})와 다릅니다.
                </span>
              )}
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">건조로 실사용량 (자동)</span>
              <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
                {dryerReal != null ? dryerReal.toFixed(1) : "-"}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">RTO 실사용량 (자동)</span>
              <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
                {rtoReal != null ? rtoReal.toFixed(1) : "-"}
              </div>
            </div>

            <div className="flex flex-col gap-1 text-sm col-span-2">
              <span className="text-slate-600">조별 사용량 = 건조로 실사용 + RTO 실사용 (자동)</span>
              <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500 font-medium">
                {gasUsageShift != null ? `${gasUsageShift.toFixed(1)} ㎥` : "누계 값을 입력하면 자동 계산됩니다"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            전일재고는 직전 교대의 누계값으로 자동 채워집니다. 값이 잘못된 경우에만 관리자 로그인 후
            &quot;수정&quot;으로 고칠 수 있습니다.
          </p>
        </fieldset>
        </div>
        </>
        )}

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-3 ${contentLocked ? "opacity-50 pointer-events-none" : ""}`}>
            <button
              type="submit"
              disabled={saving}
              className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장 (같은 날짜/조는 덮어씀)"}
            </button>
            <button
              type="button"
              onClick={onMaintenanceDay}
              className="border rounded-md px-4 py-2 text-sm font-medium"
            >
              금일 정비
            </button>
          </div>
          {currentId != null && !locked && (
            <button
              type="button"
              onClick={onConfirmLock}
              className="border border-emerald-300 text-emerald-700 rounded-md px-4 py-2 text-sm font-medium"
            >
              확정
            </button>
          )}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="border rounded-md px-4 py-2 text-sm font-medium"
          >
            ↑ 맨 위로
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      </form>
      )}

      {tab === "log" && (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-3 pt-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">최근 생산일지</h2>
            <button
              type="button"
              onClick={() => setLogsDate((d) => shiftDate(d, -1))}
              className="border rounded-md px-2 py-1 text-xs"
            >
              ◀ 전날
            </button>
            <input
              type="date"
              value={logsDate}
              onChange={(e) => setLogsDate(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => setLogsDate((d) => shiftDate(d, 1))}
              className="border rounded-md px-2 py-1 text-xs"
            >
              다음날 ▶
            </button>
            <button
              type="button"
              onClick={() => setLogsDate(today())}
              className="border rounded-md px-2 py-1 text-xs"
            >
              오늘
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 파일 다운로드 링크(페이지 이동 아님) */}
          <a href="/api/production/export" className="text-xs border border-slate-300 rounded-md px-3 py-1.5">
            엑셀 다운로드 (전체)
          </a>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">조</th>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">포장량(ton)</th>
              <th className="text-right px-3 py-2">비가동(h)</th>
              <th className="text-right px-3 py-2">가동(h)</th>
              <th className="text-right px-3 py-2">가스사용(㎥)</th>
              <th className="text-right px-3 py-2">경도</th>
              <th className="text-right px-3 py-2">수분</th>
              <th className="text-left px-3 py-2">비고</th>
              <th className="text-left px-3 py-2">입력자/수정자</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 30).map((row) => (
              <tr
                key={row.id}
                className="border-t hover:bg-slate-50 cursor-pointer"
                onClick={() => {
                  setForm((f) => ({ ...f, date: row.date, shift: row.shift }));
                }}
              >
                <td className="px-3 py-2">
                  {row.date}
                  {row.locked ? " 🔒" : ""}
                </td>
                <td className="px-3 py-2">{row.shift}</td>
                <td className="px-3 py-2">{row.worker ?? "-"}</td>
                <td className="px-3 py-2">{row.product ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.daily_pack_amount ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  {row.note?.startsWith("정비") ? (
                    <span className="text-amber-700 font-medium">금일정비</span>
                  ) : (
                    (row.downtime_hours ?? "-")
                  )}
                </td>
                <td className="px-3 py-2 text-right">{row.line_hours_total ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  {row.gas_usage_shift != null ? row.gas_usage_shift.toFixed(1) : "-"}
                </td>
                <td className="px-3 py-2 text-right">{row.hardness_manual ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.moisture_manual ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-slate-600 max-w-[160px] truncate" title={row.note ?? ""}>
                  {row.note ?? "-"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                  {row.entered_by ?? "-"}
                  {row.updated_by && row.updated_by !== row.entered_by ? ` → ${row.updated_by}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row.id);
                    }}
                    disabled={!!row.locked}
                    className="text-red-500 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-slate-400">
                  아직 입력된 생산일지가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 bg-slate-900 text-white rounded-full w-12 h-12 shadow-lg text-sm font-medium"
        aria-label="맨 위로"
      >
        ↑ 맨위
      </button>
    </div>
  );
}
