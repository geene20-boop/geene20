"use client";

import { useEffect, useState } from "react";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";

type AccountRole = "viewer" | "editor" | "modifier";

interface AccountRow {
  id: number;
  username: string;
  display_name: string | null;
  role: AccountRole;
  active: number;
}

function AccountManagementCard() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("editor");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/accounts");
    if (!res.ok) return;
    setAccounts(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role, displayName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setUsername("");
      setDisplayName("");
      setPassword("");
      setMessage("계정이 추가되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: number, newRole: AccountRole) {
    await fetch(`/api/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    refresh();
  }

  async function toggleActive(account: AccountRow) {
    await fetch(`/api/accounts/${account.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: account.active ? false : true }),
    });
    refresh();
  }

  async function resetPassword(id: number) {
    const newPassword = prompt("새 비밀번호를 입력하세요 (8자 이상)");
    if (!newPassword) return;
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) {
      setMessage(`오류: ${(await res.json()).error ?? "실패했습니다."}`);
      return;
    }
    setMessage("비밀번호가 재설정되었습니다.");
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-slate-800">계정 관리</h2>
        <p className="text-sm text-slate-500 mt-1">
          개인별 아이디/비밀번호로 로그인하며, 조회만 가능한 &quot;viewer&quot;, 입력만 가능한
          &quot;editor&quot;, 승인 전까지 수정·삭제까지 가능한 &quot;수정(modifier)&quot; 중 하나의 권한을
          부여합니다. 관리자가 기록을 &quot;승인&quot;하면 그 기록은 누구도 수정·삭제할 수 없고,
          관리자가 &quot;승인해제&quot;하면 수정 권한 계정은 수정만 가능해집니다. (관리자 비밀번호와는
          별개입니다)
        </p>
        {accounts.length === 0 && (
          <p className="text-xs mt-2 text-amber-600 font-medium">
            아직 계정이 없어서 지금은 누구나 로그인 없이 접근 가능합니다. 계정을 하나 이상 만들면
            그때부터 로그인이 필요해집니다.
          </p>
        )}
      </div>

      <form onSubmit={addAccount} className="flex gap-2 items-end flex-wrap">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">이름(표시용)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">초기 비밀번호</span>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">권한</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AccountRole)} className="border rounded-md px-2 py-1.5 text-sm">
            <option value="editor">입력 가능(editor)</option>
            <option value="modifier">수정·삭제 가능(modifier)</option>
            <option value="viewer">조회만(viewer)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !username.trim() || password.length < 8}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          계정 추가
        </button>
      </form>
      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left px-2 py-1.5">아이디</th>
            <th className="text-left px-2 py-1.5">이름</th>
            <th className="text-left px-2 py-1.5">권한</th>
            <th className="text-left px-2 py-1.5">상태</th>
            <th className="text-left px-2 py-1.5">관리</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-2 py-1.5">{a.username}</td>
              <td className="px-2 py-1.5">{a.display_name ?? "-"}</td>
              <td className="px-2 py-1.5">
                <select
                  value={a.role}
                  onChange={(e) => changeRole(a.id, e.target.value as AccountRole)}
                  className="border rounded-md px-1.5 py-1 text-xs"
                >
                  <option value="editor">입력 가능(editor)</option>
                  <option value="modifier">수정·삭제 가능(modifier)</option>
                  <option value="viewer">조회만(viewer)</option>
                </select>
              </td>
              <td className="px-2 py-1.5">
                {a.active ? (
                  <span className="text-emerald-600">활성</span>
                ) : (
                  <span className="text-slate-400">비활성</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                <div className="flex gap-2">
                  <button onClick={() => resetPassword(a.id)} className="text-xs border rounded-md px-2 py-1 bg-white">
                    비밀번호 재설정
                  </button>
                  <button onClick={() => toggleActive(a)} className="text-xs border rounded-md px-2 py-1 bg-white">
                    {a.active ? "비활성화" : "활성화"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                아직 계정이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function AdminPasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (newPassword.length < 8) {
      setMessage("오류: 새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirm) {
      setMessage("오류: 새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("관리자 비밀번호가 변경되었습니다.");
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">관리자 비밀번호 변경</h2>
        <p className="text-sm text-slate-500 mt-1">
          지금 로그인에 쓴 비밀번호를 바로 바꿀 수 있습니다. (복구 코드는 비밀번호를 잊어버렸을 때만
          사용합니다)
        </p>
      </div>
      <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">현재 비밀번호</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">새 비밀번호 확인</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !currentPassword || newPassword.length < 8}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          변경
        </button>
      </form>
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
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/backup");
    if (!res.ok) return;
    const data = await res.json();
    setBackups(data.backups ?? []);
    setEmailConfigured(!!data.emailConfigured);
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

  async function sendTestEmail() {
    setTestingEmail(true);
    setEmailMessage(null);
    try {
      const res = await fetch("/api/admin/backup/send-test", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패했습니다.");
      setEmailMessage("메일이 발송되었습니다. 받은편지함(스팸함도)을 확인해주세요.");
    } catch (err) {
      setEmailMessage(`오류: ${(err as Error).message}`);
    } finally {
      setTestingEmail(false);
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

      <div className="border-t pt-3">
        <p className="text-sm font-medium text-slate-700">이메일 자동 발송</p>
        {emailConfigured ? (
          <>
            <p className="text-xs text-slate-500 mt-1">
              설정되어 있습니다. 매일 최근 백업 파일을 지정된 이메일로 자동 발송합니다.
            </p>
            <button
              onClick={sendTestEmail}
              disabled={testingEmail}
              className="mt-2 border rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {testingEmail ? "발송 중..." : "지금 테스트 발송"}
            </button>
            {emailMessage && <p className="text-sm text-slate-600 mt-1">{emailMessage}</p>}
          </>
        ) : (
          <p className="text-xs text-amber-600 mt-1">
            아직 설정되지 않았습니다. SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BACKUP_EMAIL_TO
            환경변수를 Railway 프로젝트 설정(Variables)에 추가하면 자동으로 활성화됩니다.
          </p>
        )}
      </div>

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
          <p className="text-sm text-slate-500 mt-1">계정 관리, 데이터 백업 등을 설정합니다.</p>
        </div>
        <button onClick={() => admin.logout()} className="text-xs underline text-slate-500">
          로그아웃
        </button>
      </div>

      <AccountManagementCard />
      <AdminPasswordCard />
      <BackupCard />
    </div>
  );
}
