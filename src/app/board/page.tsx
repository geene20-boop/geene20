"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet, apiPut } from "@/lib/apiClient";
import { BoardCategory, BoardPost } from "@/lib/types";
import { BOARD_CATEGORIES, BOARD_CATEGORY_STYLE } from "@/lib/boardCategory";
import { getBoardLastSeen, markBoardSeen } from "@/lib/boardRead";

const CATEGORIES = BOARD_CATEGORIES;
const CATEGORY_STYLE = BOARD_CATEGORY_STYLE;

export default function BoardPage() {
  const session = useSiteSession();
  const [category, setCategory] = useState<BoardCategory | "">("");
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [lastSeen] = useState<string | null>(() => getBoardLastSeen());

  async function refresh() {
    const url = category ? `/api/board?category=${encodeURIComponent(category)}` : "/api/board";
    setPosts(await apiGet<BoardPost[]>(url));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    markBoardSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function remove(id: number) {
    if (!confirm("이 게시글을 삭제할까요?")) return;
    await apiDelete(`/api/board/${id}`);
    refresh();
  }

  async function togglePin(p: BoardPost) {
    await apiPut(`/api/board/${p.id}`, { pinned: p.pinned ? 0 : 1 });
    refresh();
  }

  const canWrite = session.isModifier || session.isAdmin;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">게시판</h1>
          <p className="text-sm text-slate-500 mt-1">생산계획·보수계획·휴무일 등 회사 공지를 확인합니다.</p>
        </div>
        {canWrite && (
          <Link href="/board/new" className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            + 글쓰기
          </Link>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategory("")}
          className={`text-xs border rounded-full px-3 py-1 ${category === "" ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}
        >
          전체
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`text-xs border rounded-full px-3 py-1 ${
              category === c ? "bg-slate-900 text-white border-slate-900" : `bg-white ${CATEGORY_STYLE[c]}`
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">분류</th>
              <th className="text-left px-3 py-2">제목</th>
              <th className="text-left px-3 py-2">첨부</th>
              <th className="text-left px-3 py-2">작성자</th>
              <th className="text-left px-3 py-2">등록일</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${CATEGORY_STYLE[p.category]}`}>
                    {p.category}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/board/${p.id}`} className="hover:underline inline-flex items-center gap-1.5">
                    {p.pinned ? <span title="고정됨">📌</span> : null}
                    {(lastSeen == null || p.created_at > lastSeen) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-label="안읽음" />
                    )}
                    {p.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {p.attachments.length > 0 ? `📎 ${p.attachments.length}건` : "-"}
                </td>
                <td className="px-3 py-2">{p.author}</td>
                <td className="px-3 py-2">{p.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {canWrite && (
                    <>
                      <button onClick={() => togglePin(p)} className="text-slate-500 hover:underline text-xs mr-3">
                        {p.pinned ? "고정해제" : "고정"}
                      </button>
                      <button onClick={() => remove(p.id)} className="text-red-500 hover:underline text-xs">
                        삭제
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  등록된 게시글이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
