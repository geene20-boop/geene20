"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { DocumentFile, LabJournalFormType } from "@/lib/types";
import {
  emptyContent,
  FreeformContent,
  ItemizedContent,
  LinkedContent,
} from "@/lib/labJournalContent";

const FORM_TYPES: LabJournalFormType[] = ["항목형", "자유기술형", "외부시험연동형"];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LabJournalNewPage() {
  const router = useRouter();
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  const [formType, setFormType] = useState<LabJournalFormType>("항목형");
  const [date, setDate] = useState(todayStr());
  const [researcher, setResearcher] = useState("");
  const [itemName, setItemName] = useState("");
  const [title, setTitle] = useState("");
  const [itemized, setItemized] = useState<ItemizedContent>(emptyContent("항목형") as ItemizedContent);
  const [freeform, setFreeform] = useState<FreeformContent>(emptyContent("자유기술형") as FreeformContent);
  const [linked, setLinked] = useState<LinkedContent>(emptyContent("외부시험연동형") as LinkedContent);
  const [linkedReportId, setLinkedReportId] = useState<number | "">("");
  const [reports, setReports] = useState<DocumentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.loggedIn && session.displayName) setEnteredBy(session.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  useEffect(() => {
    if (formType !== "외부시험연동형") return;
    apiGet<DocumentFile[]>("/api/documents?doc_type=test_report")
      .then(setReports)
      .catch(() => setReports([]));
  }, [formType]);

  function switchFormType(t: LabJournalFormType) {
    setFormType(t);
  }

  function addItemizedRow() {
    setItemized((c) => ({ ...c, items: [...c.items, { name: "", value: "", unit: "" }] }));
  }
  function removeItemizedRow(idx: number) {
    setItemized((c) => ({ ...c, items: c.items.filter((_, i) => i !== idx) }));
  }
  function updateItemizedRow(idx: number, field: "name" | "value" | "unit", v: string) {
    setItemized((c) => ({
      ...c,
      items: c.items.map((row, i) => (i === idx ? { ...row, [field]: v } : row)),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setBusy(true);
    setMessage(null);
    try {
      const content = formType === "항목형" ? itemized : formType === "자유기술형" ? freeform : linked;
      const row = await apiPost<{ id: number }>("/api/lab-journal", {
        form_type: formType,
        date,
        researcher: researcher || null,
        item_name: itemName || null,
        title: title.trim(),
        content,
        linked_report_id: formType === "외부시험연동형" && linkedReportId ? linkedReportId : null,
        entered_by: enteredBy.trim(),
      });
      router.push(`/lab-journal/${row.id}`);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-bold">연구실험일지 작성</h1>

      <div className="flex gap-2">
        {FORM_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchFormType(t)}
            className={`text-sm border rounded-full px-4 py-1.5 ${
              formType === t ? "bg-slate-900 text-white border-slate-900" : "bg-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <EnteredByField
          value={enteredBy}
          onChange={setEnteredBy}
          error={nameError}
          lockedValue={session.loggedIn ? session.displayName : null}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">일자</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">연구자</span>
            <input value={researcher} onChange={(e) => setResearcher(e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">품목명</span>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} className="border rounded-md px-2 py-1.5" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">제목</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="border rounded-md px-2 py-1.5" />
        </label>

        {formType === "항목형" && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">실험목적</span>
              <textarea
                value={itemized.purpose}
                onChange={(e) => setItemized((c) => ({ ...c, purpose: e.target.value }))}
                rows={2}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">실험방법</span>
              <textarea
                value={itemized.method}
                onChange={(e) => setItemized((c) => ({ ...c, method: e.target.value }))}
                rows={2}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-slate-600">측정항목</span>
              {itemized.items.map((row, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="항목명"
                    value={row.name}
                    onChange={(e) => updateItemizedRow(idx, "name", e.target.value)}
                    className="border rounded-md px-2 py-1.5 flex-1"
                  />
                  <input
                    placeholder="값"
                    value={row.value}
                    onChange={(e) => updateItemizedRow(idx, "value", e.target.value)}
                    className="border rounded-md px-2 py-1.5 w-28"
                  />
                  <input
                    placeholder="단위"
                    value={row.unit}
                    onChange={(e) => updateItemizedRow(idx, "unit", e.target.value)}
                    className="border rounded-md px-2 py-1.5 w-24"
                  />
                  <button
                    type="button"
                    onClick={() => removeItemizedRow(idx)}
                    className="text-red-500 text-xs px-2"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button type="button" onClick={addItemizedRow} className="text-sm text-blue-600 self-start">
                + 항목 추가
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">결론</span>
              <textarea
                value={itemized.conclusion}
                onChange={(e) => setItemized((c) => ({ ...c, conclusion: e.target.value }))}
                rows={2}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
          </div>
        )}

        {formType === "자유기술형" && (
          <label className="flex flex-col gap-1 text-sm border-t pt-4">
            <span className="text-slate-600">내용</span>
            <textarea
              value={freeform.content}
              onChange={(e) => setFreeform({ content: e.target.value })}
              rows={10}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        )}

        {formType === "외부시험연동형" && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">연동할 외부기관 시험성적서</span>
              <select
                value={linkedReportId}
                onChange={(e) => setLinkedReportId(e.target.value ? Number(e.target.value) : "")}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="">선택 안 함</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.item_name} ({r.ref_date ?? "날짜없음"}) - {r.filename}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                목록에 없으면 먼저 &quot;문서관리 &gt; 외부기관 시험성적서&quot;에서 업로드해주세요.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">해석/소견</span>
              <textarea
                value={linked.interpretation}
                onChange={(e) => setLinked({ interpretation: e.target.value })}
                rows={8}
                className="border rounded-md px-2 py-1.5"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            저장
          </button>
          {message && <span className="text-sm text-red-600">{message}</span>}
        </div>
      </form>
    </div>
  );
}
