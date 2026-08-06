"use client";

import { Fragment, useEffect, useState } from "react";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { Nationality, Worker } from "@/lib/types";

interface AccountRow {
  id: number;
  username: string;
  worker_id: number | null;
  active: number;
}

function AccountIssueForm({
  worker,
  onDone,
  onCancel,
}: {
  worker: Worker;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/api/accounts", {
        username: username.trim(),
        password,
        role: "viewer",
        displayName: worker.name,
        workerId: worker.id,
      });
      onDone();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border rounded-md p-3 bg-slate-50 w-full sm:w-auto">
      <p className="text-xs text-slate-600">{worker.name}님의 개인 로그인 계정 발급 (근태관리 조회용, 조회전용)</p>
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">아이디</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">비밀번호 (8자 이상)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || username.trim().length < 2 || password.length < 8}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          발급
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 underline">
          취소
        </button>
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </form>
  );
}

function WorkerRosterCard() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuingFor, setIssuingFor] = useState<number | null>(null);

  async function refresh() {
    const [workerRows, accountRows] = await Promise.all([
      apiGet<Worker[]>("/api/worker"),
      apiGet<AccountRow[]>("/api/accounts"),
    ]);
    setWorkers(workerRows);
    setAccounts(accountRows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function addWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/api/worker", { name: name.trim() });
      setName("");
      await refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeWorker(w: Worker) {
    if (!confirm(`${w.name}님을 근로자명부에서 삭제할까요?`)) return;
    try {
      await apiDelete(`/api/worker/${w.id}`);
      setMessage("근로자가 삭제되었습니다.");
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  async function updateWorker(w: Worker, patch: { hireDate?: string | null; birthDate?: string | null; nationality?: Nationality; foreignCountry?: string | null }) {
    try {
      await apiPut(`/api/worker/${w.id}`, patch);
      refresh();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-slate-800">근로자명부</h2>
        <p className="text-sm text-slate-500 mt-1">
          여기에 등록한 이름이 생산/출하 입력 등 작업자 선택 드롭다운에 나타납니다. 각 근로자에게
          개인 로그인 계정을 발급하면 근태관리에서 본인 연차현황·신청내역을 조회할 수 있습니다.
          국적을 &ldquo;외국인&rdquo;으로 지정하면 그 계정은 근태관리를 이용할 수 없고, 관리자가 일일
          출근부에서 직접 근태를 관리합니다.
        </p>
      </div>
      <form onSubmit={addWorker} className="flex gap-2 items-end flex-wrap">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-500">이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
        >
          추가
        </button>
      </form>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">이름</th>
              <th className="text-left px-3 py-2">입사일</th>
              <th className="text-left px-3 py-2">생년월일</th>
              <th className="text-left px-3 py-2">국적</th>
              <th className="text-left px-3 py-2">외국인 지역</th>
              <th className="text-left px-3 py-2">개인계정</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => {
              const account = accounts.find((a) => a.worker_id === w.id);
              return (
                <Fragment key={w.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2">{w.name}</td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        defaultValue={w.hire_date ?? ""}
                        onChange={(e) => updateWorker(w, { hireDate: e.target.value || null })}
                        className="border rounded-md px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        defaultValue={w.birth_date ?? ""}
                        onChange={(e) => updateWorker(w, { birthDate: e.target.value || null })}
                        className="border rounded-md px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={w.nationality}
                        onChange={(e) => updateWorker(w, { nationality: e.target.value as Nationality })}
                        className="border rounded-md px-2 py-1 text-xs"
                      >
                        <option value="domestic">내국인</option>
                        <option value="foreign">외국인</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {w.nationality === "foreign" ? (
                        <select
                          value={w.foreign_country ?? ""}
                          onChange={(e) => updateWorker(w, { foreignCountry: e.target.value || null })}
                          className="border rounded-md px-2 py-1 text-xs"
                        >
                          <option value="">선택</option>
                          <option value="cambodia">캄보디아</option>
                          <option value="nepal">네팔</option>
                        </select>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {account ? (
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          계정 연동됨 ({account.username})
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIssuingFor(w.id)}
                          className="text-[11px] text-sky-600 underline"
                        >
                          개인계정 발급
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeWorker(w)} className="text-slate-400 hover:text-red-500 text-sm">
                        ✕
                      </button>
                    </td>
                  </tr>
                  {issuingFor === w.id && (
                    <tr>
                      <td colSpan={7} className="px-3 pb-3">
                        <AccountIssueForm
                          worker={w}
                          onDone={() => {
                            setIssuingFor(null);
                            refresh();
                          }}
                          onCancel={() => setIssuingFor(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {workers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  등록된 근로자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WorkerPage() {
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
          <h1 className="text-xl font-bold">근로자명부</h1>
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
      <div>
        <h1 className="text-xl font-bold">근로자명부</h1>
        <p className="text-sm text-slate-500 mt-1">
          생산/출하 입력 등에서 작업자를 드롭다운으로 선택할 수 있도록 이름을 미리 등록합니다.
        </p>
      </div>
      <WorkerRosterCard />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="border rounded-md px-4 py-1.5 text-sm font-medium bg-white"
        >
          ↑ 맨 위로
        </button>
      </div>
    </div>
  );
}
