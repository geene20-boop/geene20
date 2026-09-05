"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/apiClient";
import LabJournalForm, { LabJournalSubmitPayload } from "@/components/LabJournalForm";

export default function LabJournalNewPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(payload: LabJournalSubmitPayload) {
    setBusy(true);
    setMessage(null);
    try {
      const row = await apiPost<{ id: number }>("/api/lab-journal", payload);
      router.push(`/lab-journal/${row.id}`);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">연구실험일지 작성</h1>
      <LabJournalForm onSubmit={submit} submitLabel="저장" busy={busy} errorMessage={message} />
    </div>
  );
}
