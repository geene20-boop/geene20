"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { AuditLogRow, AuditTable, TABLE_LABELS, ACTION_LABELS } from "@/lib/auditTypes";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const TABLE_OPTIONS: { value: AuditTable | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "production_log", label: "생산일지" },
  { value: "qc_test", label: "QC측정" },
  { value: "electricity_usage", label: "전력사용량" },
  { value: "monthly_utility", label: "월별 유틸리티" },
];

const ACTION_BADGE: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-sky-50 text-sky-700 border-sky-200",
  delete: "bg-red-50 text-red-700 border-red-200",
};

export default function HistoryPage() {
  const [table, setTable] = useState<AuditTable | "">("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (table) params.set("table", table);
      if (actor.trim()) params.set("actor", actor.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await apiGet<{ rows: AuditLogRow[] }>(`/api/audit-log?${params.toString()}`);
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }, [table, actor, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">이력 관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          생산일지·QC측정·전력사용량·월별 유틸리티에서 누가 언제 무엇을 등록·수정·삭제했는지
          한 곳에서 확인합니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-4 flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">구분</span>
          <select
            value={table}
            onChange={(e) => setTable(e.target.value as AuditTable | "")}
            className="border rounded-md px-2 py-1.5 text-sm"
          >
            {TABLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">입력자 검색</span>
          <input
            type="text"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="이름"
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">시작일</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">종료일</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </label>
        <button
          onClick={load}
          className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium h-fit"
        >
          조회
        </button>
        <a
          href={`/api/audit-log/export?${new URLSearchParams({
            ...(table ? { table } : {}),
            ...(actor.trim() ? { actor: actor.trim() } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }).toString()}`}
          className="text-sm border border-slate-300 rounded-md px-3 py-1.5 h-fit bg-white"
        >
          엑셀 다운로드
        </a>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="text-sm w-full">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">시간</th>
              <th className="text-left px-3 py-2">구분</th>
              <th className="text-left px-3 py-2">항목</th>
              <th className="text-left px-3 py-2">동작</th>
              <th className="text-left px-3 py-2">입력자</th>
              <th className="text-left px-3 py-2">내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs">
                  {r.created_at}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{TABLE_LABELS[r.table_name]}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.record_key}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`text-xs border rounded-full px-2 py-0.5 ${ACTION_BADGE[r.action] ?? ""}`}
                  >
                    {ACTION_LABELS[r.action]}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-medium">{r.actor}</td>
                <td className="px-3 py-2 text-slate-500">{r.summary ?? "-"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  조건에 맞는 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
