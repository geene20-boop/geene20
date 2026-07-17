"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { ElectricityUsage, Plant, PLANT_OPTIONS, PLANT_VOLTAGE } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  date: string;
  plant: Plant;
  usage_kwh: string;
  note: string;
};

const emptyForm = (): FormState => ({
  date: today(),
  plant: "1공장",
  usage_kwh: "",
  note: "",
});

function n(v: string): number | null {
  if (v.trim() === "") return null;
  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}

export default function ElectricityPage() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [rows, setRows] = useState<ElectricityUsage[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRows() {
    const data = await apiGet<ElectricityUsage[]>("/api/electricity");
    setRows(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRows();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/electricity", {
        date: form.date,
        plant: form.plant,
        usage_kwh: n(form.usage_kwh),
        note: form.note || null,
      });
      setMessage("저장되었습니다.");
      setForm({ ...emptyForm(), date: form.date });
      loadRows();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function onEdit(r: ElectricityUsage) {
    setForm({
      date: r.date,
      plant: r.plant,
      usage_kwh: r.usage_kwh != null ? String(r.usage_kwh) : "",
      note: r.note ?? "",
    });
    setMessage(null);
  }

  async function onDelete(id: number) {
    if (!confirm("이 전력사용량 기록을 삭제할까요?")) return;
    await apiDelete(`/api/electricity/${id}`);
    loadRows();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">전력사용량 입력</h1>
        <p className="text-sm text-slate-500 mt-1">
          1공장(저압)·2공장(고압) 일일 전력 사용량(kWh)을 입력합니다. 같은 날짜·공장으로 다시
          저장하면 기존 기록이 수정됩니다.
        </p>
        <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
          현재는 수동 입력 방식입니다. 한전 Open P-Meter API 승인을 받으시면, API 키를 전달해
          주시는 대로 매일 자동으로 값을 가져와 채워주는 기능을 추가로 연동해 드릴 수 있습니다.
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <span className="text-slate-600">공장</span>
            <select
              value={form.plant}
              onChange={(e) => set("plant", e.target.value as Plant)}
              className="border rounded-md px-2 py-1.5"
            >
              {PLANT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">전압구분 (자동)</span>
            <div className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500">
              {PLANT_VOLTAGE[form.plant]}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">사용량(kWh)</span>
            <input
              type="number"
              step="any"
              value={form.usage_kwh}
              onChange={(e) => set("usage_kwh", e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">비고</span>
          <input
            type="text"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
      </form>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-sm font-semibold text-slate-700">최근 전력사용량 기록</h2>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 파일 다운로드 링크(페이지 이동 아님) */}
          <a href="/api/electricity/export" className="text-xs border border-slate-300 rounded-md px-3 py-1.5">
            엑셀 다운로드 (전체)
          </a>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">날짜</th>
              <th className="text-left px-3 py-2">공장</th>
              <th className="text-left px-3 py-2">전압구분</th>
              <th className="text-right px-3 py-2">사용량(kWh)</th>
              <th className="text-left px-3 py-2">입력방식</th>
              <th className="text-left px-3 py-2">비고</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.plant}</td>
                <td className="px-3 py-2">{r.voltage_type}</td>
                <td className="px-3 py-2 text-right">
                  {r.usage_kwh != null ? r.usage_kwh.toLocaleString() : "-"}
                </td>
                <td className="px-3 py-2">{r.source === "api" ? "자동(API)" : "수동입력"}</td>
                <td className="px-3 py-2">{r.note ?? "-"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(r)} className="text-sky-600 hover:underline mr-3">
                    수정
                  </button>
                  <button onClick={() => onDelete(r.id)} className="text-red-500 hover:underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  아직 입력된 전력사용량 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
