"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { ImprovementPlanComment } from "@/lib/types";

function fmt(ts: string): string {
  // DB 시각은 UTC(datetime('now'))이므로 한국 시간으로 바꿔 "10/01 13:20" 형태로 보여준다.
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 상세 팝업의 의견란: 담당자·관리자 의견과 상태 변경 진행 기록을 시간순으로 보여준다.
export default function CommentThread({
  planId,
  me,
  canWrite,
  reloadKey,
  onChanged,
}: {
  planId: number;
  me: string;
  canWrite: boolean;
  reloadKey: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<ImprovementPlanComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ImprovementPlanComment[]>(`/api/improvement-plan/${planId}/comments`)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, reloadKey]);

  async function post() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const row = await apiPost<ImprovementPlanComment>(`/api/improvement-plan/${planId}/comments`, {
        body,
        entered_by: me,
      });
      setRows((prev) => [...(prev ?? []), row]);
      setText("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("이 의견을 삭제할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/improvement-plan/${planId}/comments/${id}`, { entered_by: me });
      setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const commentCount = (rows ?? []).filter((r) => r.kind === "comment").length;

  return (
    <div className="mx-5 mb-4 rounded-xl bg-slate-50 border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">
          의견 · 진행 기록 <span className="text-xs font-normal text-slate-400">의견 {commentCount}건</span>
        </span>
      </div>
      {rows === null ? (
        <div className="text-xs text-slate-400 py-2">불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">아직 의견이 없습니다. 담당자와 관리자가 여기서 의견을 주고받을 수 있습니다.</div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {rows.map((r) =>
            r.kind === "history" ? (
              <div key={r.id} className="text-[11.5px] text-slate-500 border border-dashed border-slate-300 rounded-md px-2.5 py-1.5">
                <span className="tabular-nums">{fmt(r.created_at)}</span> · {r.author} · <b className="text-slate-700">{r.body}</b>
              </div>
            ) : (
              <div
                key={r.id}
                className={`bg-white border rounded-md px-2.5 py-1.5 text-sm border-l-4 ${
                  r.role === "관리자" ? "border-l-sky-500" : r.role === "담당자" ? "border-l-emerald-500" : "border-l-slate-300"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <b className="text-slate-800">{r.author}</b>
                  {r.role && (
                    <span
                      className={`font-semibold px-1.5 rounded-full border ${
                        r.role === "관리자"
                          ? "text-sky-700 bg-sky-50 border-sky-200"
                          : "text-emerald-700 bg-emerald-50 border-emerald-200"
                      }`}
                    >
                      {r.role}
                    </span>
                  )}
                  <span className="tabular-nums">{fmt(r.created_at)}</span>
                  {canWrite && r.author === me && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(r.id)}
                      className="ml-auto text-slate-400 hover:text-red-600"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="whitespace-pre-wrap break-words">{r.body}</div>
              </div>
            )
          )}
        </div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
      {canWrite && (
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) post();
            }}
            placeholder="의견을 입력하세요"
            maxLength={1000}
            className="flex-1 min-w-0 border rounded-md px-2 py-1.5 text-sm bg-white"
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={post}
            className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 whitespace-nowrap"
          >
            등록
          </button>
        </div>
      )}
    </div>
  );
}
