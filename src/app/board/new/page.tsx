"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BoardCategory } from "@/lib/types";

const CATEGORIES: BoardCategory[] = ["생산계획", "보수계획", "휴무일", "기타"];

export default function BoardNewPage() {
  const router = useRouter();
  const [category, setCategory] = useState<BoardCategory>("생산계획");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("title", title.trim());
      form.append("body", body.trim());
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/board", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록에 실패했습니다.");
      router.push(`/board/${data.id}`);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-xl font-bold">게시판 글쓰기</h1>
      <form onSubmit={submit} className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">분류</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BoardCategory)}
              className="border rounded-md px-2 py-1.5"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-slate-600">제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">본문</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">첨부파일 (이미지 / PDF / 엑셀, 여러 개 가능)</span>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.pdf,.xlsx,.xls,.csv"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            등록
          </button>
          {message && <span className="text-sm text-red-600">{message}</span>}
        </div>
      </form>
    </div>
  );
}
