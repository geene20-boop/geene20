"use client";

import { useEffect, useState } from "react";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { Worker } from "@/lib/types";

function WorkerRosterCard() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setWorkers(await apiGet<Worker[]>("/api/worker"));
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
    await apiDelete(`/api/worker/${w.id}`);
    refresh();
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-slate-800">근로자명부</h2>
        <p className="text-sm text-slate-500 mt-1">
          여기에 등록한 이름이 생산/출하 입력 등 작업자 선택 드롭다운에 나타납니다.
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
      <div className="flex flex-wrap gap-2">
        {workers.map((w) => (
          <span
            key={w.id}
            className="flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm bg-slate-50"
          >
            {w.name}
            <button onClick={() => removeWorker(w)} className="text-slate-400 hover:text-red-500">
              ✕
            </button>
          </span>
        ))}
        {workers.length === 0 && <p className="text-sm text-slate-400">등록된 근로자가 없습니다.</p>}
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
