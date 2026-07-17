"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { ProductionLog } from "@/lib/types";

type FormState = {
  date: string;
  shift: "주" | "야";
  product: string;
  daily_pack_amount: string;
  dryer_temp_a: string;
  dryer_temp_b: string;
  feed_hopper_a: string;
  feed_hopper_b: string;
  feed_fine_powder: string;
  feed_mixer: string;
  feed_molder: string;
  brix: string;
  line_hours_a: string;
  line_hours_b: string;
  lng_dryer: string;
  lng_rto: string;
  gas_usage_shift: string;
  moisture_manual: string;
  hardness_manual: string;
  note: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  date: today(),
  shift: "주",
  product: "",
  daily_pack_amount: "",
  dryer_temp_a: "",
  dryer_temp_b: "",
  feed_hopper_a: "",
  feed_hopper_b: "",
  feed_fine_powder: "",
  feed_mixer: "",
  feed_molder: "",
  brix: "",
  line_hours_a: "",
  line_hours_b: "",
  lng_dryer: "",
  lng_rto: "",
  gas_usage_shift: "",
  moisture_manual: "",
  hardness_manual: "",
  note: "",
};

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

function Field({
  label,
  value,
  onChange,
  type = "number",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        step="any"
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

  const feedTotal = useMemo(() => {
    const a = n(form.feed_mixer) ?? 0;
    const b = n(form.feed_molder) ?? 0;
    return a + b;
  }, [form.feed_mixer, form.feed_molder]);

  const lineHoursTotal = useMemo(() => {
    const a = n(form.line_hours_a) ?? 0;
    const b = n(form.line_hours_b) ?? 0;
    return a + b;
  }, [form.line_hours_a, form.line_hours_b]);

  async function loadLogs() {
    const rows = await apiGet<ProductionLog[]>("/api/production");
    setLogs(rows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLogs();
  }, []);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/production", {
        date: form.date,
        shift: form.shift,
        product: form.product || null,
        daily_pack_amount: n(form.daily_pack_amount),
        dryer_temp_a: n(form.dryer_temp_a),
        dryer_temp_b: n(form.dryer_temp_b),
        feed_hopper_a: n(form.feed_hopper_a),
        feed_hopper_b: n(form.feed_hopper_b),
        feed_fine_powder: n(form.feed_fine_powder),
        feed_mixer: n(form.feed_mixer),
        feed_molder: n(form.feed_molder),
        feed_total: feedTotal,
        brix: n(form.brix),
        line_hours_a: n(form.line_hours_a),
        line_hours_b: n(form.line_hours_b),
        line_hours_total: lineHoursTotal,
        lng_dryer: n(form.lng_dryer),
        lng_rto: n(form.lng_rto),
        gas_usage_shift: n(form.gas_usage_shift),
        moisture_manual: n(form.moisture_manual),
        hardness_manual: n(form.hardness_manual),
        note: form.note || null,
      });
      setMessage("저장되었습니다.");
      setForm((f) => ({ ...emptyForm, date: f.date, shift: f.shift === "주" ? "야" : "주" }));
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
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">생산일지 입력</h1>
        <p className="text-sm text-slate-500 mt-1">
          교대(주/야)별 설비가동정보를 입력합니다. 해당 날짜·조의 QC 측정 평균값과 포장일지
          포장량이 있으면 자동으로 참고값이 표시됩니다. (포장일지 연동은 데이터 가져오기 화면에서
          설정)
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="날짜" type="date" value={form.date} onChange={(v) => set("date", v)} />
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
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">A+B 합계 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">{lineHoursTotal.toFixed(2)}</div>
          </div>
        </Section>

        <Section title="LNG 사용량 (㎥)">
          <Field label="건조로 누계" value={form.lng_dryer} onChange={(v) => set("lng_dryer", v)} />
          <Field label="RTO 누계" value={form.lng_rto} onChange={(v) => set("lng_rto", v)} />
          <Field label="조별 사용량" value={form.gas_usage_shift} onChange={(v) => set("gas_usage_shift", v)} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">가동시간당 사용량 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
              {lineHoursTotal > 0 && n(form.gas_usage_shift) != null
                ? ((n(form.gas_usage_shift) as number) / lineHoursTotal).toFixed(1)
                : "-"}
            </div>
          </div>
        </Section>

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
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">포장량(ton)</th>
              <th className="text-right px-3 py-2">가동시간</th>
              <th className="text-right px-3 py-2">가스사용(㎥)</th>
              <th className="text-right px-3 py-2">경도</th>
              <th className="text-right px-3 py-2">수분</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 30).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{row.shift}</td>
                <td className="px-3 py-2">{row.product ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.daily_pack_amount ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.line_hours_total ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.gas_usage_shift ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.hardness_manual ?? "-"}</td>
                <td className="px-3 py-2 text-right">{row.moisture_manual ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onDelete(row.id)} className="text-red-500 hover:underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
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
