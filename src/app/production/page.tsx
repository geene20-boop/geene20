"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { ProductionLog } from "@/lib/types";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";

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
  granulation_usage_per_min: string;
  line_hours_a: string;
  line_hours_b: string;
  downtime_hours: string;
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
  granulation_usage_per_min: "",
  line_hours_a: "",
  line_hours_b: "",
  downtime_hours: "",
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
    granulation_usage_per_min: toFormValue(row.granulation_usage_per_min),
    line_hours_a: toFormValue(row.line_hours_a),
    line_hours_b: toFormValue(row.line_hours_b),
    downtime_hours: toFormValue(row.downtime_hours),
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [carryoverUnlocked, setCarryoverUnlocked] = useState(false);

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

  const gasUsageShift = useMemo(() => {
    if (dryerReal == null && rtoReal == null) return null;
    return (dryerReal ?? 0) + (rtoReal ?? 0);
  }, [dryerReal, rtoReal]);

  const agentOptions = useMemo(
    () => [...new Set(logs.map((l) => l.granulation_agent).filter((v): v is string => !!v))],
    [logs]
  );

  async function loadLogs() {
    const rows = await apiGet<ProductionLog[]>("/api/production");
    setLogs(rows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLogs();
  }, []);

  // 날짜/조가 바뀌면 기존 기록이 있는지 조회해서 있으면 불러오고, 없으면 새 입력 상태로 초기화
  useEffect(() => {
    let cancelled = false;
    async function loadForDate() {
      const rows = await apiGet<ProductionLog[]>(`/api/production?from=${form.date}&to=${form.date}`);
      if (cancelled) return;
      const existing = rows.find((r) => r.shift === form.shift);
      setCarryoverUnlocked(false);
      if (existing) {
        setCurrentId(existing.id);
        setForm((f) => ({ ...fromLog(existing), date: f.date, shift: f.shift }));
      } else {
        setCurrentId(null);
        setForm((f) => ({ ...emptyForm, date: f.date, shift: f.shift }));
        const preview = await apiGet<{ dryer: number | null; rto: number | null }>(
          `/api/production/carryover-preview?date=${form.date}&shift=${form.shift}`
        );
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          carryover_dryer: toFormValue(preview.dryer),
          carryover_rto: toFormValue(preview.rto),
        }));
      }
    }
    loadForDate();
    return () => {
      cancelled = true;
    };
  }, [form.date, form.shift]);

  useEffect(() => {
    let cancelled = false;
    async function loadQcRef() {
      if (!form.date || !form.shift) return;
      const { rows } = await apiGet<{ rows: { date: string; shift: string; qcHardnessAvg: number | null; qcMoistureAvg: number | null; qcBrixAvg: number | null }[] }>(
        `/api/dashboard?from=${form.date}&to=${form.date}`
      );
      if (cancelled) return;
      const match = rows.find((r) => r.date === form.date && r.shift === form.shift);
      setQcRef({
        hardness: match?.qcHardnessAvg ?? null,
        moisture: match?.qcMoistureAvg ?? null,
        brix: match?.qcBrixAvg ?? null,
      });
    }
    loadQcRef();
    return () => {
      cancelled = true;
    };
  }, [form.date, form.shift]);

  useEffect(() => {
    let cancelled = false;
    async function loadPackingRef() {
      if (!form.date) return;
      const res = await fetch(`/api/packing-log?date=${form.date}`);
      const data = await res.json();
      if (cancelled) return;
      if (!data.configured) {
        setPackingRef(null);
        return;
      }
      setPackingRef({
        configured: true,
        tonQty: typeof data.tonQty === "number" ? data.tonQty : null,
        bagPackQty: data.bagPackQty ?? 0,
        bagPackCount: data.bagPackCount ?? 0,
      });
    }
    loadPackingRef();
    return () => {
      cancelled = true;
    };
  }, [form.date]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function requestCarryoverEdit() {
    if (admin.loggedIn) {
      setCarryoverUnlocked(true);
    } else {
      setShowAdminModal(true);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        date: form.date,
        shift: form.shift,
        product: form.product || null,
        daily_pack_amount: n(form.daily_pack_amount),
        worker: form.worker || null,
        dryer_temp_a: n(form.dryer_temp_a),
        dryer_temp_b: n(form.dryer_temp_b),
        feed_hopper_a: n(form.feed_hopper_a),
        feed_hopper_b: n(form.feed_hopper_b),
        feed_fine_powder: n(form.feed_fine_powder),
        feed_mixer: n(form.feed_mixer),
        feed_molder: n(form.feed_molder),
        brix: n(form.brix),
        granulation_agent: form.granulation_agent || null,
        granulation_usage_per_min: n(form.granulation_usage_per_min),
        line_hours_a: n(form.line_hours_a),
        line_hours_b: n(form.line_hours_b),
        downtime_hours: n(form.downtime_hours),
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
      loadLogs();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("이 생산일지 항목을 삭제할까요?")) return;
    await apiDelete(`/api/production/${id}`);
    loadLogs();
    if (id === currentId) {
      setCurrentId(null);
      setForm((f) => ({ ...emptyForm, date: f.date, shift: f.shift }));
    }
  }

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
          onClose={() => setShowAdminModal(false)}
          onSuccess={() => {
            admin.setLoggedIn(true);
            setCarryoverUnlocked(true);
            setShowAdminModal(false);
          }}
        />
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-sm">
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
              <input
                type="text"
                placeholder="작업자 이름"
                value={form.worker}
                onChange={(e) => set("worker", e.target.value)}
                className="border rounded-md px-2 py-1.5 flex-1 min-w-0"
              />
            </div>
          </label>
          <Field label="생산품목" type="text" value={form.product} onChange={(v) => set("product", v)} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">
              일일포장량(ton)
              {packingRef?.tonQty != null && ` (포장일지 참고: ${packingRef.tonQty}톤)`}
            </span>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                value={form.daily_pack_amount}
                onChange={(e) => set("daily_pack_amount", e.target.value)}
                className="border rounded-md px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
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
            {packingRef && packingRef.bagPackCount > 0 && (
              <span className="text-[11px] text-amber-600">
                포 단위 포장 {packingRef.bagPackCount}건({packingRef.bagPackQty}포)은 톤 환산이 안 되어
                제외됨
              </span>
            )}
          </div>
        </div>
        {currentId != null && (
          <p className="text-xs text-sky-600 bg-sky-50 border border-sky-200 rounded-md px-3 py-1.5 w-fit">
            이 날짜/조는 기존에 저장된 기록을 불러왔습니다 (ID {currentId}). 저장하면 덮어씁니다.
          </p>
        )}

        <Section title="건조로 셋팅 온도 (℃)">
          <Field label="A라인" value={form.dryer_temp_a} onChange={(v) => set("dryer_temp_a", v)} />
          <Field label="B라인" value={form.dryer_temp_b} onChange={(v) => set("dryer_temp_b", v)} />
        </Section>

        <Section title="원료 피딩 조건 (Hz)">
          <Field label="A호퍼" value={form.feed_hopper_a} onChange={(v) => set("feed_hopper_a", v)} />
          <Field label="B호퍼" value={form.feed_hopper_b} onChange={(v) => set("feed_hopper_b", v)} />
          <Field label="A/B미분" value={form.feed_fine_powder} onChange={(v) => set("feed_fine_powder", v)} />
        </Section>

        <Section title="조립제 투입 조건 (Hz)">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">조립제 이름</span>
            <input
              type="text"
              list="agent-options"
              value={form.granulation_agent}
              onChange={(e) => set("granulation_agent", e.target.value)}
              placeholder="검색 또는 입력"
              className="border rounded-md px-2 py-1.5"
            />
            <datalist id="agent-options">
              {agentOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <Field
            label="분당 사용량"
            value={form.granulation_usage_per_min}
            onChange={(v) => set("granulation_usage_per_min", v)}
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

        <Section title="라인 가동 시간 (Hr)">
          <Field label="A라인" value={form.line_hours_a} onChange={(v) => set("line_hours_a", v)} />
          <Field label="B라인" value={form.line_hours_b} onChange={(v) => set("line_hours_b", v)} />
          <Field label="비가동시간" value={form.downtime_hours} onChange={(v) => set("downtime_hours", v)} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">A+B 합계 - 비가동 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">{lineHoursTotal.toFixed(2)}</div>
          </div>
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
              <span className="text-slate-600 flex items-center gap-1">
                전일재고 - 건조로 누계
                {!carryoverUnlocked && (
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
                className="border rounded-md px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 flex items-center gap-1">
                전일재고 - RTO 누계
                {!carryoverUnlocked && (
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
                className="border rounded-md px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
              />
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

        <Section title="제품 품질확인 (수기입력, 비우면 QC 평균 자동 적용)">
          <Field
            label={`수분량${qcRef.moisture != null ? ` (QC평균: ${qcRef.moisture.toFixed(2)})` : ""}`}
            value={form.moisture_manual}
            onChange={(v) => set("moisture_manual", v)}
            placeholder={qcRef.moisture != null ? String(qcRef.moisture.toFixed(2)) : undefined}
          />
          <Field
            label={`경도${qcRef.hardness != null ? ` (QC평균: ${qcRef.hardness.toFixed(2)})` : ""}`}
            value={form.hardness_manual}
            onChange={(v) => set("hardness_manual", v)}
            placeholder={qcRef.hardness != null ? String(qcRef.hardness.toFixed(2)) : undefined}
          />
        </Section>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">비고</span>
          <textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className="border rounded-md px-2 py-1.5"
            rows={2}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장 (같은 날짜/조는 덮어씀)"}
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
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
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{row.shift}</td>
                <td className="px-3 py-2">{row.worker ?? "-"}</td>
                <td className="px-3 py-2">{row.product ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.daily_pack_amount ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.downtime_hours ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.line_hours_total ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  {row.gas_usage_shift != null ? row.gas_usage_shift.toFixed(1) : "-"}
                </td>
                <td className="px-3 py-2 text-right">{row.hardness_manual ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.moisture_manual ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row.id);
                    }}
                    className="text-red-500 hover:underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                  아직 입력된 생산일지가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
