"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { QcTest, inferShift } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toISOString().slice(11, 16);

type FormState = {
  sample_no: string;
  fertilizer_type: string;
  date: string;
  time: string;
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
  fertilizer_type: "입상규산질",
  date: today(),
  time: nowHHMM(),
  values: Array(20).fill(""),
  burner_temp: "",
  granulation_brix: "",
  granulation_input: "",
  fine_powder: "",
  hopper: "",
  moisture: "",
  worker: "",
});

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

  function setValue(i: number, v: string) {
    setForm((f) => {
      const values = [...f.values];
      values[i] = v;
      return { ...f, values };
    });
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        sample_no: n(form.sample_no),
        fertilizer_type: form.fertilizer_type || null,
        date: form.date,
        shift: inferShift(form.time),
        time: form.time,
        burner_temp: n(form.burner_temp),
        granulation_brix: n(form.granulation_brix),
        granulation_input: n(form.granulation_input),
        fine_powder: n(form.fine_powder),
        hopper: n(form.hopper),
        moisture: n(form.moisture),
        worker: form.worker || null,
      };
      form.values.forEach((v, i) => {
        body[`v${i + 1}`] = n(v);
      });
      await apiPost("/api/qc", body);
      setMessage("저장되었습니다.");
      setForm({ ...emptyForm(), date: form.date, fertilizer_type: form.fertilizer_type });
      loadTests();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("이 측정 기록을 삭제할까요?")) return;
    await apiDelete(`/api/qc/${id}`);
    loadTests();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">QC측정 입력 (비료시료 강도테스트)</h1>
        <p className="text-sm text-slate-500 mt-1">
          시료 20개 경도값을 입력하면 합계·평균이 자동 계산되고, 날짜·시간으로 조(주/야)가 자동
          판별되어 생산일지와 연동됩니다.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">시료 No.</span>
            <input
              type="number"
              value={form.sample_no}
              onChange={(e) => set("sample_no", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비종</span>
            <input
              type="text"
              value={form.fertilizer_type}
              onChange={(e) => set("fertilizer_type", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">날짜</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">시간</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">조 (자동판별)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
              {form.time ? (inferShift(form.time) === "주" ? "주간조" : "야간조") : "-"}
            </div>
          </div>
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
          <legend className="text-sm font-semibold text-slate-700 px-1">생산조건 / 수분 / 작업자</legend>
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
              <span className="text-slate-600">수분</span>
              <input
                type="number"
                step="any"
                value={form.moisture}
                onChange={(e) => set("moisture", e.target.value)}
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : "측정 기록 저장"}
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
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tests.slice(0, 30).map((t) => {
              const vals = Array.from({ length: 20 }, (_, i) => t[`v${i + 1}` as keyof QcTest] as number | null).filter(
                (v): v is number => typeof v === "number"
              );
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">{t.date}</td>
                  <td className="px-3 py-2">{t.time ?? "-"}</td>
                  <td className="px-3 py-2">{t.shift}</td>
                  <td className="px-3 py-2">{t.fertilizer_type ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{avg != null ? avg.toFixed(2) : "-"}</td>
                  <td className="px-3 py-2 text-right">{t.moisture ?? "-"}</td>
                  <td className="px-3 py-2">{t.worker ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onDelete(t.id)} className="text-red-500 hover:underline">
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
            {tests.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
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
