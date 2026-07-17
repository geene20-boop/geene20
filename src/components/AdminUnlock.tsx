"use client";

import { useEffect, useState } from "react";

export function useAdminSession() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checked, setChecked] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/session");
    const data = await res.json();
    setLoggedIn(!!data.loggedIn);
    setChecked(true);
    return data as { passwordSet: boolean; loggedIn: boolean };
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggedIn(false);
  }

  return { loggedIn, checked, refresh, logout, setLoggedIn };
}

export default function AdminLoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d) => {
        setPasswordSet(d.passwordSet);
        setChecked(true);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!passwordSet) {
        if (password.length < 4) throw new Error("비밀번호는 4자 이상이어야 합니다.");
        if (password !== confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
        const res = await fetch("/api/admin/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "설정에 실패했습니다.");
      } else {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "로그인에 실패했습니다.");
      }
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-xl border p-5 w-full max-w-sm flex flex-col gap-3"
      >
        <h2 className="font-semibold text-slate-800">
          {passwordSet === false ? "관리자 비밀번호 최초 설정" : "관리자 로그인"}
        </h2>
        {passwordSet === false && (
          <p className="text-xs text-slate-500">
            아직 관리자 비밀번호가 설정되지 않았습니다. 여기서 처음 설정하는 비밀번호가 앞으로의
            관리자 비밀번호가 됩니다.
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5"
            autoFocus
          />
        </label>
        {passwordSet === false && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">비밀번호 확인</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={onClose} className="border rounded-md px-3 py-1.5 text-sm">
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !checked}
            className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {busy ? "처리 중..." : passwordSet === false ? "설정하고 로그인" : "로그인"}
          </button>
        </div>
      </form>
    </div>
  );
}
