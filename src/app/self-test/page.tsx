"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet } from "@/lib/apiClient";
import { SelfTestCertificate } from "@/lib/types";

export default function SelfTestPage() {
  const session = useSiteSession();
  const [itemName, setItemName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<SelfTestCertificate[]>([]);

  async function refresh() {
    const params = new URLSearchParams();
    if (itemName.trim()) params.set("item_name", itemName.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setRows(await apiGet<SelfTestCertificate[]>(`/api/self-test-certificate?${params.toString()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemName, from, to]);

  async function remove(id: number) {
    if (!confirm("이 발행 이력을 삭제할까요?")) return;
    await apiDelete(`/api/self-test-certificate/${id}`);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">자체시험성적서 (수출용)</h1>
          <p className="text-sm text-slate-500 mt-1">
            품목 선택 시 규격이 자동으로 채워집니다. 결과값만 입력해 바로 발행하세요.
          </p>
        </div>
        {session.canWrite && (
          <Link href="/self-test/new" className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            + 새 발행
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">품목명</span>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="검색"
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">발행일 시작</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">발행일 끝</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1.5" />
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">발행일</th>
              <th className="text-left px-3 py-2">품목명</th>
              <th className="text-left px-3 py-2">언어</th>
              <th className="text-left px-3 py-2">발송처</th>
              <th className="text-left px-3 py-2">발행자</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.issued_date}</td>
                <td className="px-3 py-2">
                  <Link href={`/self-test/${r.id}`} className="hover:underline text-blue-600">
                    {r.item_name}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.language}</td>
                <td className="px-3 py-2">{r.consignee ?? "-"}</td>
                <td className="px-3 py-2">{r.issued_by}</td>
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
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  발행 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
