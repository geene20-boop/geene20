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
    return data as { passwordSet: boolean; loggedIn: boolean; name: string | null; recoveryAvailable: boolean };
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggedIn(false);
  }

  return { loggedIn, checked, refresh, logout, setLoggedIn };
}

function RecoverForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (newPassword.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
      if (newPassword !== confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
      const res = await fetch("/api/admin/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "복구에 실패했습니다.");
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="font-semibold text-slate-800">비밀번호 복구</h2>
      <p className="text-xs text-slate-500">
        서버 관리자만 아는 복구 코드(환경변수 ADMIN_RECOVERY_CODE)로 새 비밀번호를 설정합니다.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">복구 코드</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="border rounded-md px-2 py-1.5"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">새 비밀번호</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="border rounded-md px-2 py-1.5"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">새 비밀번호 확인</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border rounded-md px-2 py-1.5"
        />
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onBack} className="border rounded-md px-3 py-1.5 text-sm">
          뒤로
        </button>
        <button
          type="submit"
          disabled={busy}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "처리 중..." : "비밀번호 재설정"}
        </button>
      </div>
    </form>
  );
}

export default function AdminLoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [name, setName] = useState("");
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
        setRecoveryAvailable(!!d.recoveryAvailable);
        setChecked(true);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!passwordSet) {
        if (password.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
        if (password !== confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
        const res = await fetch("/api/admin/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, name: name.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "설정에 실패했습니다.");
      } else {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, name: name.trim() }),
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl border p-5 w-full max-w-sm"
      >
        {mode === "recover" ? (
          <RecoverForm onSuccess={onSuccess} onBack={() => setMode("login")} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
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
              <span className="text-slate-600">이름 (입력자명에 기록됩니다)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="실제 이름을 입력하세요"
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
            {passwordSet === true && recoveryAvailable && (
              <button
                type="button"
                onClick={() => setMode("recover")}
                className="text-xs text-sky-600 underline self-start"
              >
                비밀번호를 잊으셨나요?
              </button>
            )}
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
        )}
      </div>
    </div>
  );
}
