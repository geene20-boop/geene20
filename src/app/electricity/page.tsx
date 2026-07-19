"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { ElectricityUsage, Plant, PLANT_OPTIONS, PLANT_VOLTAGE } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";

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

const monthStart = () => today().slice(0, 8) + "01";

type Totals = { plant1: number; plant2: number; total: number; plant1Days: number; plant2Days: number };

export default function ElectricityPage() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingKey, setEditingKey] = useState<{ date: string; plant: Plant } | null>(null);
  const [rows, setRows] = useState<ElectricityUsage[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [rangeFrom, setRangeFrom] = useState(monthStart());
  const [rangeTo, setRangeTo] = useState(today());
  const [totals, setTotals] = useState<Totals | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  async function loadRows() {
    const data = await apiGet<ElectricityUsage[]>("/api/electricity");
    setRows(data);
  }

  async function loadSummary(from: string, to: string) {
    const data = await apiGet<{ totals: Totals }>(
      `/api/electricity/summary?from=${from}&to=${to}`
    );
    setTotals(data.totals);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRows();
    loadSummary(monthStart(), today());
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
      await apiPost("/api/electricity", {
        date: form.date,
        plant: form.plant,
        usage_kwh: n(form.usage_kwh),
        note: form.note || null,
        entered_by: enteredBy.trim(),
      });
      setMessage("저장되었습니다.");
      setForm(emptyForm());
      setEditingKey(null);
      loadRows();
      loadSummary(rangeFrom, rangeTo);
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
    setEditingKey({ date: r.date, plant: r.plant });
    setMessage(null);
  }

  function onCancelEdit() {
    setForm(emptyForm());
    setEditingKey(null);
    setMessage(null);
  }

  async function onDelete(id: number) {
    if (!enteredBy.trim()) {
      alert("삭제하려면 먼저 입력자명을 입력해주세요.");
      return;
    }
    if (!confirm("이 전력사용량 기록을 삭제할까요?")) return;
    await apiDelete(`/api/electricity/${id}`, { entered_by: enteredBy.trim() });
    loadRows();
    loadSummary(rangeFrom, rangeTo);
  }

  const fmtKwh = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

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

      {/* 기간별 조회 + 1공장/2공장/합계 (req1) */}
      <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">시작일</span>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">종료일</span>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            onClick={() => loadSummary(rangeFrom, rangeTo)}
            className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium h-fit"
          >
            기간 합계 조회
          </button>
        </div>
        {totals && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs text-sky-700">1공장 (저압) 합계</div>
              <div className="text-2xl font-bold text-sky-800 tabular-nums">
                {fmtKwh(totals.plant1)}
                <span className="text-sm font-normal ml-1">kWh</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{totals.plant1Days}일 입력됨</div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs text-violet-700">2공장 (고압) 합계</div>
              <div className="text-2xl font-bold text-violet-800 tabular-nums">
                {fmtKwh(totals.plant2)}
                <span className="text-sm font-normal ml-1">kWh</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{totals.plant2Days}일 입력됨</div>
            </div>
            <div className="rounded-lg border border-indigo-300 bg-indigo-100 p-4">
              <div className="text-xs text-indigo-700 font-medium">전체 합계 (1+2공장)</div>
              <div className="text-2xl font-bold text-indigo-900 tabular-nums">
                {fmtKwh(totals.total)}
                <span className="text-sm font-normal ml-1">kWh</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {rangeFrom} ~ {rangeTo}
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-white rounded-xl border p-5">
        {editingKey && (
          <div className="flex items-center justify-between text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-md px-3 py-2">
            <span>
              {editingKey.date} · {editingKey.plant} 기록을 수정 중입니다. (날짜·공장은 변경할 수
              없습니다)
            </span>
            <button type="button" onClick={onCancelEdit} className="underline">
              취소
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EnteredByField value={enteredBy} onChange={setEnteredBy} error={nameError} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">날짜</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              disabled={!!editingKey}
              className="border rounded-md px-2 py-1.5 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">공장</span>
            <select
              value={form.plant}
              onChange={(e) => set("plant", e.target.value as Plant)}
              disabled={!!editingKey}
              className="border rounded-md px-2 py-1.5 disabled:bg-slate-100 disabled:text-slate-400"
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
            {saving ? "저장 중..." : editingKey ? "수정 저장" : "저장"}
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
              <th className="text-left px-3 py-2">입력자/수정자</th>
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
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                  {r.entered_by ?? "-"}
                  {r.updated_by && r.updated_by !== r.entered_by ? ` → ${r.updated_by}` : ""}
                </td>
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
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
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
