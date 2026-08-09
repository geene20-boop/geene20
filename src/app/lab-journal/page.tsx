"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet } from "@/lib/apiClient";
import { LabJournal, LabJournalFormType } from "@/lib/types";

const FORM_TYPES: LabJournalFormType[] = ["항목형", "자유기술형", "외부시험연동형"];

export default function LabJournalPage() {
  const session = useSiteSession();
  const [formType, setFormType] = useState<LabJournalFormType | "">("");
  const [itemName, setItemName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<LabJournal[]>([]);

  async function refresh() {
    const params = new URLSearchParams();
    if (formType) params.set("form_type", formType);
    if (itemName.trim()) params.set("item_name", itemName.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setRows(await apiGet<LabJournal[]>(`/api/lab-journal?${params.toString()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formType, itemName, from, to]);

  async function remove(id: number) {
    if (!confirm("이 실험일지를 삭제할까요?")) return;
    await apiDelete(`/api/lab-journal/${id}`);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">연구실험일지</h1>
          <p className="text-sm text-slate-500 mt-1">
            항목형·자유기술형·외부시험 연동형 중 골라 작성하고, 기간별로 조회·인쇄합니다.
          </p>
        </div>
        {session.canWrite && (
          <Link href="/lab-journal/new" className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            + 새 실험일지
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">양식</span>
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value as LabJournalFormType | "")}
            className="border rounded-md px-2 py-1.5"
          >
            <option value="">전체</option>
            {FORM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">품목명</span>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="검색" className="border rounded-md px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">기간 시작</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">기간 끝</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1.5" />
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">일자</th>
              <th className="text-left px-3 py-2">양식</th>
              <th className="text-left px-3 py-2">제목</th>
              <th className="text-left px-3 py-2">품목명</th>
              <th className="text-left px-3 py-2">연구자</th>
              <th className="text-left px-3 py-2">작성자</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.form_type}</td>
                <td className="px-3 py-2">
                  <Link href={`/lab-journal/${r.id}`} className="hover:underline text-blue-600">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.item_name ?? "-"}</td>
                <td className="px-3 py-2">{r.researcher ?? "-"}</td>
                <td className="px-3 py-2">{r.entered_by}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {session.isAdmin && (
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:underline text-xs">
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  등록된 실험일지가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
