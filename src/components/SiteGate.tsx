"use client";

import { useState } from "react";

export default function SiteGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/site/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "로그인에 실패했습니다.");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="bg-white rounded-xl border p-6 w-full max-w-sm flex flex-col gap-3">
        <h1 className="font-semibold text-slate-800 text-lg">(주)한일씨앤에스 통합정보시스템</h1>
        <p className="text-sm text-slate-500">아이디와 비밀번호를 입력해주세요.</p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">아이디</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border rounded-md px-2 py-1.5"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "확인 중..." : "입장"}
        </button>
      </form>
    </div>
  );
}
