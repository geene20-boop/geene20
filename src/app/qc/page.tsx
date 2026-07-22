"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { PackingItem, QcTest, inferShift } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { useSiteSession } from "@/lib/useSiteSession";

const today = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toISOString().slice(11, 16);

type FormState = {
  sample_no: string;
  fertilizer_type: string;
  date: string; // 생산일자
  time: string; // 생산시각
  measured_date: string; // 측정일자
  measured_time: string; // 측정시각
  values: string[]; // 20
  burner_temp: string;
  granulation_brix: string;
  granulation_input: string;
  fine_powder: string;
  hopper: string;
  moisture: string;
  worker: string;
};

const emptyForm = (): FormState => ({
  sample_no: "",
  fertilizer_type: "",
  date: today(),
  time: nowHHMM(),
  measured_date: today(),
  measured_time: nowHHMM(),
  values: Array(20).fill(""),
  burner_temp: "",
  granulation_brix: "",
  granulation_input: "",
  fine_powder: "",
  hopper: "",
  moisture: "",
  worker: "",
});

const DRAFT_KEY = "qc_draft";

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

export default function QcPage() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [tests, setTests] = useState<QcTest[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState<FormState | null>(null);
  const session = useSiteSession();

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  useEffect(() => {
    apiGet<PackingItem[]>("/api/packing-item").then((items) => {
      const cats = Array.from(
        new Set(items.filter((i) => i.kind === "product" && i.category).map((i) => i.category as string))
      );
      setProductOptions(cats);
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftAvailable(saved ? (JSON.parse(saved) as FormState) : null);
    } catch {
      setDraftAvailable(null);
    }
  }, []);

  // 입력 중인 내용을 잠깐 멈춘 사이(0.8초) 브라우저에 임시 저장 - 저장 안 하고 나가도 복구 가능
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // localStorage 사용 불가 시 조용히 무시
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, dirty]);

  const values = form.values.map(n).filter((v): v is number => v != null);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length ? sum / values.length : null;

  async function loadTests() {
    const rows = await apiGet<QcTest[]>("/api/qc");
    setTests(rows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTests();
  }, []);

  // 시료 No.는 해당 생산일자에 이미 등록된 최대 번호 다음 값으로 자동 생성한다 (수기입력 없음)
  const nextSampleNo = useMemo(() => {
    const sameDate = tests.filter((t) => t.date === form.date);
    const maxNo = sameDate.reduce((m, t) => Math.max(m, t.sample_no ?? 0), 0);
    return maxNo + 1;
  }, [tests, form.date]);

  const effectiveSampleNo = editingId != null ? form.sample_no : String(nextSampleNo);

  function setValue(i: number, v: string) {
    setForm((f) => {
      const values = [...f.values];
      values[i] = v;
      return { ...f, values };
    });
    setDirty(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // 무시
    }
    setDraftAvailable(null);
    setDirty(false);
  }

  function restoreDraft() {
    if (!draftAvailable) return;
    setForm(draftAvailable);
    setDraftAvailable(null);
    setDirty(true);
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setMessage(null);
    clearDraft();
  }

  // Enter로 저장되어 버리는 걸 막고, 대신 다음 입력칸으로 포커스를 옮긴다.
  // (저장은 반드시 하단 저장 버튼을 눌러야만 되도록)
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (target instanceof HTMLButtonElement && target.type === "submit") return;
    e.preventDefault();
    const formEl = e.currentTarget;
    const focusable = Array.from(
      formEl.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")
    );
    const idx = focusable.indexOf(target);
    if (idx >= 0 && idx < focusable.length - 1) {
      focusable[idx + 1].focus();
    }
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
        sample_no: n(effectiveSampleNo),
        fertilizer_type: form.fertilizer_type || null,
        date: form.date,
        shift: inferShift(form.time),
        time: form.time,
        measured_date: form.measured_date || null,
        measured_time: form.measured_time || null,
        burner_temp: n(form.burner_temp),
        granulation_brix: n(form.granulation_brix),
        granulation_input: n(form.granulation_input),
        fine_powder: n(form.fine_powder),
        hopper: n(form.hopper),
        moisture: n(form.moisture),
        worker: form.worker || null,
        entered_by: enteredBy.trim(),
      };
      form.values.forEach((v, i) => {
        body[`v${i + 1}`] = n(v);
      });
      if (editingId != null) {
        await apiPut(`/api/qc/${editingId}`, body);
        setMessage("수정되었습니다.");
        setEditingId(null);
        setForm(emptyForm());
      } else {
        await apiPost("/api/qc", body);
        setMessage("저장되었습니다.");
        setForm({ ...emptyForm(), date: form.date, fertilizer_type: form.fertilizer_type });
      }
      clearDraft();
      loadTests();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function onEdit(t: QcTest) {
    setForm({
      sample_no: t.sample_no != null ? String(t.sample_no) : "",
      fertilizer_type: t.fertilizer_type ?? "",
      date: t.date,
      time: t.time ?? "",
      measured_date: t.measured_date ?? t.date,
      measured_time: t.measured_time ?? t.time ?? "",
      values: Array.from({ length: 20 }, (_, i) => {
        const v = t[`v${i + 1}` as keyof QcTest] as number | null;
        return v != null ? String(v) : "";
      }),
      burner_temp: t.burner_temp != null ? String(t.burner_temp) : "",
      granulation_brix: t.granulation_brix != null ? String(t.granulation_brix) : "",
      granulation_input: t.granulation_input != null ? String(t.granulation_input) : "",
      fine_powder: t.fine_powder != null ? String(t.fine_powder) : "",
      hopper: t.hopper != null ? String(t.hopper) : "",
      moisture: t.moisture != null ? String(t.moisture) : "",
      worker: t.worker ?? "",
    });
    setEditingId(t.id);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onCancelEdit() {
    resetForm();
  }

  async function onDelete(id: number) {
    if (!enteredBy.trim()) {
      alert("삭제하려면 먼저 입력자명을 입력해주세요.");
      return;
    }
    if (!confirm("이 측정 기록을 삭제할까요?")) return;
    await apiDelete(`/api/qc/${id}`, { entered_by: enteredBy.trim() });
    if (editingId === id) onCancelEdit();
    loadTests();
  }

  const fertilizerOptions =
    form.fertilizer_type && !productOptions.includes(form.fertilizer_type)
      ? [form.fertilizer_type, ...productOptions]
      : productOptions;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">QC측정 입력 (비료시료 강도테스트)</h1>
        <p className="text-sm text-slate-500 mt-1">
          시료 20개 경도값을 입력하면 합계·평균이 자동 계산되고, 날짜·시간으로 조(주/야)가 자동
          판별되어 생산일지와 연동됩니다.
        </p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 입력·수정은 editor 권한이 필요합니다.
        </div>
      )}

      {draftAvailable && editingId == null && (
        <div className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
          <span>저장하지 않고 나갔던 임시 입력 내용이 있습니다.</span>
          <div className="flex gap-3">
            <button type="button" onClick={restoreDraft} className="underline">
              불러오기
            </button>
            <button type="button" onClick={clearDraft} className="underline">
              삭제
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        onKeyDown={handleFormKeyDown}
        className={`flex flex-col gap-4 bg-white rounded-xl border p-5 ${
          !session.canWrite ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {editingId != null && (
          <div className="flex items-center justify-between text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-md px-3 py-2">
            <span>{form.date} · 시료No.{form.sample_no || "-"} 기록을 수정 중입니다.</span>
            <button type="button" onClick={onCancelEdit} className="underline">
              취소
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">시료 No. (자동생성)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
              {effectiveSampleNo || "-"}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비종</span>
            <select
              value={form.fertilizer_type}
              onChange={(e) => set("fertilizer_type", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="">선택하세요</option>
              {fertilizerOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">조 (자동판별)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
              {form.time ? (inferShift(form.time) === "주" ? "주간조" : "야간조") : "-"}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">생산일자</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">생산시각</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">측정일자</span>
            <input
              type="date"
              value={form.measured_date}
              onChange={(e) => set("measured_date", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">측정시각</span>
            <input
              type="time"
              value={form.measured_time}
              onChange={(e) => set("measured_time", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>

        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-semibold text-slate-700 px-1">
            경도 측정값 (20개 시료, kgf 등 현장 단위)
          </legend>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2 mt-2">
            {form.values.map((v, i) => (
              <label key={i} className="flex flex-col gap-1 text-xs">
                <span className="text-slate-500">{i + 1}</span>
                <input
                  type="number"
                  step="any"
                  value={v}
                  onChange={(e) => setValue(i, e.target.value)}
                  className="border rounded-md px-1.5 py-1 text-sm w-full"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-6 mt-3 text-sm text-slate-600">
            <span>
              합계: <b>{sum.toFixed(2)}</b>
            </span>
            <span>
              시료수: <b>{values.length}</b>
            </span>
            <span>
              평균: <b>{avg != null ? avg.toFixed(2) : "-"}</b>
            </span>
          </div>
        </fieldset>

        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-semibold text-slate-700 px-1">생산조건 / 작업자</legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">버너</span>
              <input
                type="number"
                step="any"
                value={form.burner_temp}
                onChange={(e) => set("burner_temp", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">조립제 당도(Brix)</span>
              <input
                type="number"
                step="any"
                value={form.granulation_brix}
                onChange={(e) => set("granulation_brix", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">조립제 투입량</span>
              <input
                type="number"
                step="any"
                value={form.granulation_input}
                onChange={(e) => set("granulation_input", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">미분말</span>
              <input
                type="number"
                step="any"
                value={form.fine_powder}
                onChange={(e) => set("fine_powder", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">호퍼</span>
              <input
                type="number"
                step="any"
                value={form.hopper}
                onChange={(e) => set("hopper", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">작업자</span>
              <input
                type="text"
                value={form.worker}
                onChange={(e) => set("worker", e.target.value)}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-semibold text-slate-700 px-1">
            수분 측정값 (120도, 8g 스탠다드 기준)
          </legend>
          <label className="flex flex-col gap-1 text-sm mt-2 max-w-[200px]">
            <span className="text-slate-600">수분(%)</span>
            <input
              type="number"
              step="any"
              value={form.moisture}
              onChange={(e) => set("moisture", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : editingId != null ? "수정 저장" : "측정 기록 저장"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="border rounded-md px-4 py-2 text-sm font-medium"
          >
            새로 측정하기
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-sm font-semibold text-slate-700">최근 측정 기록</h2>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 파일 다운로드 링크(페이지 이동 아님) */}
          <a href="/api/qc/export" className="text-xs border border-slate-300 rounded-md px-3 py-1.5">
            엑셀 다운로드 (전체)
          </a>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">시간</th>
              <th className="text-left px-3 py-2">조</th>
              <th className="text-left px-3 py-2">비종</th>
              <th className="text-right px-3 py-2">평균경도</th>
              <th className="text-right px-3 py-2">수분</th>
              <th className="text-left px-3 py-2">작업자</th>
              <th className="text-left px-3 py-2">입력자/수정자</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tests.slice(0, 30).map((t) => {
              const vals = Array.from({ length: 20 }, (_, i) => t[`v${i + 1}` as keyof QcTest] as number | null).filter(
                (v): v is number => typeof v === "number"
              );
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const expanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2">{t.date}</td>
                    <td className="px-3 py-2">{t.time ?? "-"}</td>
                    <td className="px-3 py-2">{t.shift}</td>
                    <td className="px-3 py-2">{t.fertilizer_type ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{avg != null ? avg.toFixed(2) : "-"}</td>
                    <td className="px-3 py-2 text-right">{t.moisture ?? "-"}</td>
                    <td className="px-3 py-2">{t.worker ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {t.entered_by ?? "-"}
                      {t.updated_by && t.updated_by !== t.entered_by ? ` → ${t.updated_by}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        className="text-slate-500 hover:underline mr-3"
                      >
                        {expanded ? "접기" : "상세보기"}
                      </button>
                      <button onClick={() => onEdit(t)} className="text-sky-600 hover:underline mr-3">
                        수정
                      </button>
                      <button onClick={() => onDelete(t.id)} className="text-red-500 hover:underline">
                        삭제
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t bg-slate-50">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs text-slate-600">
                          <span>측정일시: {t.measured_date ?? "-"} {t.measured_time ?? ""}</span>
                          <span>버너: {t.burner_temp ?? "-"}</span>
                          <span>조립제 당도(Brix): {t.granulation_brix ?? "-"}</span>
                          <span>조립제 투입량: {t.granulation_input ?? "-"}</span>
                          <span>미분말: {t.fine_powder ?? "-"}</span>
                          <span>호퍼: {t.hopper ?? "-"}</span>
                          <span>시료No.: {t.sample_no ?? "-"}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {tests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  아직 입력된 측정 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
