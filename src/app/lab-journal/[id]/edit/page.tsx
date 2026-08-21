"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/apiClient";
import { LabJournal } from "@/lib/types";
import LabJournalForm, { LabJournalSubmitPayload } from "@/components/LabJournalForm";

export default function LabJournalEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<LabJournal | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<LabJournal>(`/api/lab-journal/${params.id}`)
      .then(setEntry)
      .catch(() => setNotFound(true));
  }, [params.id]);

  async function submit(payload: LabJournalSubmitPayload) {
    setBusy(true);
    setMessage(null);
    try {
      await apiPut(`/api/lab-journal/${params.id}`, payload);
      router.push(`/lab-journal/${params.id}`);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) return <p className="text-sm text-slate-400">실험일지를 찾을 수 없습니다.</p>;
  if (!entry) return <p className="text-sm text-slate-400">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">연구실험일지 수정</h1>
      <LabJournalForm entry={entry} onSubmit={submit} submitLabel="수정 저장" busy={busy} errorMessage={message} />
    </div>
  );
}
