"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet } from "@/lib/apiClient";
import { BoardPost } from "@/lib/types";
import { BOARD_CATEGORY_STYLE as CATEGORY_STYLE } from "@/lib/boardCategory";

export default function BoardDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSiteSession();
  const [post, setPost] = useState<BoardPost | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiGet<BoardPost>(`/api/board/${params.id}`)
      .then(setPost)
      .catch(() => setNotFound(true));
  }, [params.id]);

  async function remove() {
    if (!post || !confirm("이 게시글을 삭제할까요?")) return;
    await apiDelete(`/api/board/${post.id}`);
    router.push("/board");
  }

  if (notFound) {
    return <p className="text-sm text-slate-400">게시글을 찾을 수 없습니다.</p>;
  }
  if (!post) {
    return <p className="text-sm text-slate-400">불러오는 중...</p>;
  }

  const canWrite = session.isModifier || session.isAdmin;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/board" className="text-sm text-slate-500 underline w-fit">
        ← 게시판 목록
      </Link>
      <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className={`text-xs border rounded-full px-2 py-0.5 ${CATEGORY_STYLE[post.category]}`}>
              {post.category}
            </span>
            <h1 className="text-lg font-bold mt-2">{post.title}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {post.author} · {post.created_at.slice(0, 16).replace("T", " ")}
            </p>
          </div>
          {canWrite && (
            <button onClick={remove} className="text-red-500 hover:underline text-sm">
              삭제
            </button>
          )}
        </div>
        {post.body && <p className="text-sm text-slate-700 whitespace-pre-wrap">{post.body}</p>}
        {post.attachments.length > 0 && (
          <div className="border-t pt-3 flex flex-col gap-1.5">
            <span className="text-xs text-slate-500">첨부파일</span>
            {post.attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/board/attachment/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sky-700 hover:underline"
              >
                📎 {a.filename} ({(a.size / 1024).toFixed(0)}KB)
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
