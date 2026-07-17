"use client";

import { useEffect, useState } from "react";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";

function SitePasswordCard() {
  const [configured, setConfigured] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/site/session");
    const data = await res.json();
    setConfigured(!!data.configured);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/site/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setPassword("");
      setMessage("저장되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("현장 비밀번호를 해제하면 누구나 로그인 없이 앱을 사용할 수 있게 됩니다. 계속할까요?"))
      return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/site/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setMessage("현장 비밀번호가 해제되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">현장 작업자 접근 비밀번호</h2>
        <p className="text-sm text-slate-500 mt-1">
          여기서 설정한 비밀번호를 현장 작업자들과 공유하세요. 이 비밀번호를 입력해야 앱의 어떤
          화면이든 사용할 수 있습니다. (관리자 비밀번호와는 별개입니다)
        </p>
        <p className="text-xs mt-2">
          현재 상태:{" "}
          {configured ? (
            <span className="text-emerald-600 font-medium">설정됨</span>
          ) : (
            <span className="text-amber-600 font-medium">설정 안 됨 (지금은 누구나 접근 가능)</span>
          )}
        </p>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="새 현장 비밀번호"
          className="border rounded-md px-2 py-1.5 text-sm"
        />
        <button
          onClick={save}
          disabled={busy || password.length < 4}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          저장
        </button>
        {configured && (
          <button onClick={clear} disabled={busy} className="border rounded-md px-3 py-1.5 text-sm text-red-600">
            해제
          </button>
        )}
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function BackupCard() {
  const [backups, setBackups] = useState<{ name: string; sizeBytes: number; createdAt: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/backup");
    if (!res.ok) return;
    const data = await res.json();
    setBackups(data.backups ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function backupNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setMessage("백업이 생성되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">데이터 백업</h2>
        <p className="text-sm text-slate-500 mt-1">
          서버가 6시간마다 자동으로 데이터베이스 스냅샷을 만들어 최근 {backups.length ? backups.length : 14}
          개까지 보관합니다. 다만 이건 같은 서버 안에 저장되는 백업이라, 서버/볼륨 자체에 문제가
          생기면 함께 사라질 수 있습니다. <b>정기적으로 아래에서 다운로드해 컴퓨터나 클라우드에도
          따로 보관해두는 걸 권장합니다.</b>
        </p>
      </div>
      <div className="flex gap-2 items-center">
        <a
          href="/api/admin/backup/download"
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm inline-block"
        >
          지금 백업 다운로드
        </a>
        <button onClick={backupNow} disabled={busy} className="border rounded-md px-3 py-1.5 text-sm disabled:opacity-50">
          {busy ? "생성 중..." : "새 스냅샷 생성"}
        </button>
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="text-xs text-slate-500 mt-1">
        <p className="font-medium text-slate-600 mb-1">서버에 저장된 스냅샷 ({backups.length}개)</p>
        {backups.length === 0 && <p>아직 없습니다.</p>}
        <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {backups.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-2">
              <span>
                {new Date(b.createdAt).toLocaleString("ko-KR")} ({formatBytes(b.sizeBytes)})
              </span>
              <a href={`/api/admin/backup/download?name=${b.name}`} className="text-sky-600 underline">
                다운로드
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const admin = useAdminSession();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!admin.checked) {
    return <p className="text-sm text-slate-400">확인 중...</p>;
  }

  if (!admin.loggedIn) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <div>
          <h1 className="text-xl font-bold">관리자 설정</h1>
          <p className="text-sm text-slate-500 mt-1">이 화면은 관리자 로그인이 필요합니다.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium"
        >
          관리자 로그인
        </button>
        {showModal && (
          <AdminLoginModal
            onClose={() => setShowModal(false)}
            onSuccess={() => {
              admin.setLoggedIn(true);
              setShowModal(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">관리자 설정</h1>
          <p className="text-sm text-slate-500 mt-1">현장 비밀번호 관리, 데이터 백업 등을 설정합니다.</p>
        </div>
        <button onClick={() => admin.logout()} className="text-xs underline text-slate-500">
          로그아웃
        </button>
      </div>

      <SitePasswordCard />
      <BackupCard />
    </div>
  );
}
