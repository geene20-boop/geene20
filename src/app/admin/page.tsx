"use client";

import { useCallback, useEffect, useState } from "react";
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
  const role: AccountRole = "editor";
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
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "권한 변경 실패");
      }
      setMessage("권한이 변경되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function toggleActive(account: AccountRow) {
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: account.active ? false : true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "상태 변경 실패");
      }
      setMessage(account.active ? "계정이 비활성화되었습니다." : "계정이 활성화되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
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

      <ModulePermissionCard accounts={accounts} />
    </div>
  );
}

// 모듈별 기능 정의
const MODULE_FEATURES: Record<string, string[]> = {
  "시스템관리": ["이력관리", "백업관리", "관리자설정"],
  "근태관리": ["승인관리", "근태신청", "연차현황"],
  "생산관리": ["생산입력", "생산현황"],
  "제품포장": ["포장입력", "출하관리", "재고현황"],
};

interface ModulePermission {
  id: number;
  user_id: number;
  module: string;
  can_view: number;
  can_create: number;
  can_update: number;
  can_delete: number;
  is_hidden: number;
}

function ModulePermissionCard({ accounts }: { accounts: AccountRow[] }) {
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const allPerms: ModulePermission[] = [];
      for (const account of accounts) {
        const res = await fetch(`/api/permissions?user_id=${account.id}`);
        if (res.ok) {
          const userPerms = await res.json();
          allPerms.push(...userPerms);
        }
      }
      setPermissions(allPerms);
    } catch (err) {
      console.error("Failed to load permissions:", err);
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPermissions();
  }, [loadPermissions]);

  function getPermission(user_id: number, module: string) {
    return permissions.find(
      (p) => p.user_id === user_id && p.module === module
    );
  }

  function togglePermission(
    user_id: number,
    module: string,
    permission: "can_view" | "can_create" | "can_update" | "can_delete" | "is_hidden"
  ) {
    const perm = getPermission(user_id, module);
    const newValue = perm ? !perm[permission] : true;

    if (perm) {
      setPermissions(
        permissions.map((p) =>
          p.id === perm.id ? { ...p, [permission]: newValue ? 1 : 0 } : p
        )
      );
    } else {
      setPermissions([
        ...permissions,
        {
          id: -1,
          user_id,
          module,
          can_view: permission === "can_view" ? 1 : 0,
          can_create: permission === "can_create" ? 1 : 0,
          can_update: permission === "can_update" ? 1 : 0,
          can_delete: permission === "can_delete" ? 1 : 0,
          is_hidden: permission === "is_hidden" ? 1 : 0,
        },
      ]);
    }
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    try {
      for (const module of Object.keys(MODULE_FEATURES)) {
        for (const account of accounts) {
          const perm = getPermission(account.id, module);
          if (!perm) continue;

          const res = await fetch("/api/permissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: perm.user_id,
              module: perm.module,
              can_view: perm.can_view,
              can_create: perm.can_create,
              can_update: perm.can_update,
              can_delete: perm.can_delete,
              is_hidden: perm.is_hidden,
            }),
          });
          if (!res.ok) throw new Error(`Failed to save permission for user ${account.id}`);
        }
      }
      setMessage("권한이 저장되었습니다.");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save permissions:", err);
      setMessage("권한 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-slate-800">모듈별 권한 관리</h2>
        <p className="text-sm text-slate-500 mt-1">
          각 모듈별로 사용자에게 권한(조회/입력/수정/삭제/안보이기)을 제어합니다. 모듈에 부여된 권한은 그 모듈의 모든 기능에 동일하게 적용됩니다.
        </p>
      </div>

      <div style={{ overflowX: "auto", marginBottom: "12px" }}>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f0f0f0" }}>
            <tr>
              <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd", minWidth: "120px" }}>모듈</th>
              {accounts.map((account) => (
                <th key={account.id} style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #ddd", minWidth: "140px" }}>
                  {account.display_name || account.username}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(MODULE_FEATURES).map((module) => (
              <tr key={module} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "10px", fontWeight: "500", background: "#fafafa" }}>
                  📁 {module}
                </td>
                {accounts.map((account) => {
                  const perm = getPermission(account.id, module);
                  return (
                    <td key={account.id} style={{ padding: "8px", borderRight: "1px solid #eee" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                        <label title="조회" style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            checked={!!perm?.can_view}
                            onChange={() => togglePermission(account.id, module, "can_view")}
                            disabled={loading}
                            style={{ cursor: loading ? "default" : "pointer" }}
                          />
                          <span>조회</span>
                        </label>
                        <label title="입력" style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            checked={!!perm?.can_create}
                            onChange={() => togglePermission(account.id, module, "can_create")}
                            disabled={loading}
                            style={{ cursor: loading ? "default" : "pointer" }}
                          />
                          <span>입력</span>
                        </label>
                        <label title="수정" style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            checked={!!perm?.can_update}
                            onChange={() => togglePermission(account.id, module, "can_update")}
                            disabled={loading}
                            style={{ cursor: loading ? "default" : "pointer" }}
                          />
                          <span>수정</span>
                        </label>
                        <label title="삭제" style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            checked={!!perm?.can_delete}
                            onChange={() => togglePermission(account.id, module, "can_delete")}
                            disabled={loading}
                            style={{ cursor: loading ? "default" : "pointer" }}
                          />
                          <span>삭제</span>
                        </label>
                        <label title="안보이기" style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px" }}>
                          <input
                            type="checkbox"
                            checked={!!perm?.is_hidden}
                            onChange={() => togglePermission(account.id, module, "is_hidden")}
                            disabled={loading}
                            style={{ cursor: loading ? "default" : "pointer" }}
                          />
                          <span>숨김</span>
                        </label>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          onClick={saveAll}
          disabled={saving}
          style={{
            padding: "8px 16px",
            background: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: saving ? "default" : "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {message && (
          <span style={{ fontSize: "12px", color: message.includes("실패") ? "#d32f2f" : "#388e3c" }}>
            {message}
          </span>
        )}
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

type PmeterResult = {
  plant: string;
  date: string;
  usage_kwh: number | null;
  status: "saved" | "skipped_manual" | "no_data" | "error";
  error?: string;
};

const PMETER_STATUS_LABELS: Record<PmeterResult["status"], string> = {
  saved: "저장됨",
  skipped_manual: "수동입력 있어 건너뜀",
  no_data: "조회된 값 없음",
  error: "오류",
};

function PmeterCard() {
  const [configured, setConfigured] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PmeterResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/pmeter");
    if (!res.ok) return;
    const data = await res.json();
    setConfigured(!!data.configured);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function runNow() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pmeter", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "실패했습니다.");
      setResults(data.results);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">한전 Open P-Meter 자동 연동</h2>
        <p className="text-sm text-slate-500 mt-1">
          매일 오전 8시(KST)에 전일 전력사용량을 1공장·2공장 각각 자동으로 조회해 전력사용량
          화면에 채워 넣습니다. 같은 날짜에 이미 수동 입력이 있으면 자동 값으로 덮어쓰지 않습니다.
        </p>
      </div>
      {configured ? (
        <>
          <p className="text-xs text-emerald-600">설정되어 있습니다. 자동 연동이 활성화됩니다.</p>
          <button
            onClick={runNow}
            disabled={running}
            className="border rounded-md px-3 py-1.5 text-sm disabled:opacity-50 w-fit"
          >
            {running ? "동기화 중..." : "지금 동기화 실행 (전일치)"}
          </button>
        </>
      ) : (
        <p className="text-xs text-amber-600">
          아직 설정되지 않았습니다. KEPCO_PMETER_API_KEY, KEPCO_PMETER_CUSTNO_PLANT1,
          KEPCO_PMETER_CUSTNO_PLANT2 환경변수를 Railway 프로젝트 설정(Variables)에 추가하면
          자동으로 활성화됩니다.
        </p>
      )}
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {results && (
        <ul className="text-xs text-slate-600 flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.plant}>
              {r.date} {r.plant}: {r.usage_kwh != null ? `${r.usage_kwh.toLocaleString()}kWh · ` : ""}
              {PMETER_STATUS_LABELS[r.status]}
              {r.error ? ` (${r.error})` : ""}
            </li>
          ))}
        </ul>
      )}
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
      <PmeterCard />
    </div>
  );
}
