"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { CertificateLanguage, SelfTestItemSpec } from "@/lib/types";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SelfTestNewPage() {
  const router = useRouter();
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  const [specs, setSpecs] = useState<SelfTestItemSpec[]>([]);
  const [itemName, setItemName] = useState("");
  const [isNewItem, setIsNewItem] = useState(false);
  const [specification, setSpecification] = useState("");
  const [remarks, setRemarks] = useState("");
  const [result, setResult] = useState("");
  const [language, setLanguage] = useState<CertificateLanguage>("국문");
  const [consignee, setConsignee] = useState("");
  const [reportNo, setReportNo] = useState("");
  const [issuedDate, setIssuedDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SelfTestItemSpec[]>("/api/self-test-spec").then(setSpecs).catch(() => setSpecs([]));
  }, []);

  useEffect(() => {
    if (session.loggedIn && session.displayName) setEnteredBy(session.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  function onItemSelect(name: string) {
    setItemName(name);
    if (name === "__new__") {
      setIsNewItem(true);
      setSpecification("");
      setRemarks("");
      return;
    }
    setIsNewItem(false);
    const spec = specs.find((s) => s.item_name === name);
    setSpecification(spec?.specification ?? "");
    setRemarks(spec?.remarks ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = isNewItem ? newItemName.trim() : itemName;
    if (!finalName) return;
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setBusy(true);
    setMessage(null);
    try {
      if (isNewItem) {
        await apiPost("/api/self-test-spec", {
          item_name: finalName,
          specification,
          remarks,
          entered_by: enteredBy.trim(),
        });
      }
      const cert = await apiPost<{ id: number }>("/api/self-test-certificate", {
        report_no: reportNo || null,
        item_name: finalName,
        specification,
        remarks,
        result,
        language,
        consignee: consignee || null,
        issued_date: issuedDate,
        entered_by: enteredBy.trim(),
      });
      router.push(`/self-test/${cert.id}`);
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const [newItemName, setNewItemName] = useState("");

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-xl font-bold">자체시험성적서 발행</h1>
      <form onSubmit={submit} className="bg-white rounded-xl border p-5 flex flex-col gap-4">
        <EnteredByField
          value={enteredBy}
          onChange={setEnteredBy}
          error={nameError}
          lockedValue={session.loggedIn ? session.displayName : null}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">품목</span>
          <select
            value={isNewItem ? "__new__" : itemName}
            onChange={(e) => onItemSelect(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          >
            <option value="">선택하세요</option>
            {specs.map((s) => (
              <option key={s.item_name} value={s.item_name}>
                {s.item_name}
              </option>
            ))}
            <option value="__new__">+ 새 품목 등록</option>
          </select>
        </label>
        {isNewItem && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">새 품목명</span>
            <input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Specification (규격)</span>
            <textarea
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              rows={3}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Remarks (비고)</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Result (결과값)</span>
          <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={3}
            className="border rounded-md px-2 py-1.5"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">언어</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as CertificateLanguage)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="국문">국문</option>
              <option value="영문">영문</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">발행일자</span>
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">성적서 번호(선택)</span>
            <input
              value={reportNo}
              onChange={(e) => setReportNo(e.target.value)}
              className="border rounded-md px-2 py-1.5"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">발송처(선택)</span>
          <input
            value={consignee}
            onChange={(e) => setConsignee(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || (!isNewItem && !itemName) || (isNewItem && !newItemName.trim())}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            발행
          </button>
          {message && <span className="text-sm text-red-600">{message}</span>}
        </div>
      </form>
    </div>
  );
}
