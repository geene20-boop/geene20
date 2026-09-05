"use client";

import { useEffect, useMemo, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { apiDelete, apiGet } from "@/lib/apiClient";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import Modal from "@/components/Modal";
import { DocumentCategory, DocumentFile, DocumentLanguage, DocumentType } from "@/lib/types";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB, /api/documents와 동일한 제한
const CATEGORIES: DocumentCategory[] = ["원료", "제품"];
const LANGUAGES: DocumentLanguage[] = ["국문", "영문", "기타"];

export default function DocumentLibrary({
  docType,
  title,
  description,
  dateLabel,
  showLanguageFilter,
  markStale,
}: {
  docType: DocumentType;
  title: string;
  description: string;
  dateLabel: string;
  showLanguageFilter: boolean;
  /** 품목별로 가장 최신 것을 제외한 나머지에 "구버전" 배지를 붙일지 (MSDS용) */
  markStale?: boolean;
}) {
  const session = useSiteSession();
  const canWrite = session.canWrite;

  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [itemName, setItemName] = useState("");
  const [language, setLanguage] = useState<DocumentLanguage | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<DocumentFile[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  async function refresh() {
    const params = new URLSearchParams({ doc_type: docType });
    if (category) params.set("category", category);
    if (itemName.trim()) params.set("item_name", itemName.trim());
    if (language) params.set("language", language);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setRows(await apiGet<DocumentFile[]>(`/api/documents?${params.toString()}`));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, itemName, language, from, to]);

  const staleIds = useMemo(() => {
    if (!markStale) return new Set<number>();
    const seenItem = new Set<string>();
    const stale = new Set<number>();
    for (const r of rows) {
      if (seenItem.has(r.item_name)) stale.add(r.id);
      else seenItem.add(r.item_name);
    }
    return stale;
  }, [rows, markStale]);

  async function remove(id: number) {
    if (!confirm("이 문서를 삭제할까요?")) return;
    await apiDelete(`/api/documents/${id}`);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium"
          >
            + 업로드
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">구분</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory | "")}
            className="border rounded-md px-2 py-1.5"
          >
            <option value="">전체</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">품목명</span>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="검색"
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        {showLanguageFilter && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">언어</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as DocumentLanguage | "")}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="">전체</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{dateLabel} 시작</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{dateLabel} 끝</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">구분</th>
              <th className="text-left px-3 py-2">품목명</th>
              {showLanguageFilter && <th className="text-left px-3 py-2">언어</th>}
              <th className="text-left px-3 py-2">{dateLabel}</th>
              <th className="text-left px-3 py-2">파일</th>
              <th className="text-left px-3 py-2">업로드자</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2">
                  {r.item_name}
                  {staleIds.has(r.id) && (
                    <span className="ml-2 text-xs border rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
                      구버전
                    </span>
                  )}
                </td>
                {showLanguageFilter && <td className="px-3 py-2">{r.language ?? "-"}</td>}
                <td className="px-3 py-2">{r.ref_date ?? "-"}</td>
                <td className="px-3 py-2">
                  <a
                    href={`/api/documents/file/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    📄 {r.filename}
                  </a>
                </td>
                <td className="px-3 py-2">{r.entered_by}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {session.isAdmin && (
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:underline text-xs">
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showLanguageFilter ? 7 : 6} className="px-3 py-8 text-center text-slate-400">
                  등록된 문서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showUpload && (
        <UploadModal
          docType={docType}
          dateLabel={dateLabel}
          showLanguageFilter={showLanguageFilter}
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function UploadModal({
  docType,
  dateLabel,
  showLanguageFilter,
  onClose,
  onDone,
}: {
  docType: DocumentType;
  dateLabel: string;
  showLanguageFilter: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const session = useSiteSession();
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("제품");
  const [itemName, setItemName] = useState("");
  const [language, setLanguage] = useState<DocumentLanguage>("국문");
  const [refDate, setRefDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.loggedIn && session.displayName) setEnteredBy(session.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  function onFileSelected(f: File | null) {
    if (f && f.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError(`${f.name} 파일이 15MB를 초과합니다.`);
      return;
    }
    setFile(f);
    setFileError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim() || !file) return;
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("doc_type", docType);
      form.append("category", category);
      form.append("item_name", itemName.trim());
      if (showLanguageFilter) form.append("language", language);
      if (refDate) form.append("ref_date", refDate);
      form.append("entered_by", enteredBy.trim());
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드에 실패했습니다.");
      onDone();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="문서 업로드" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <EnteredByField
          value={enteredBy}
          onChange={setEnteredBy}
          error={nameError}
          lockedValue={session.loggedIn ? session.displayName : null}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">구분</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="border rounded-md px-2 py-1.5"
            >
              <option value="원료">원료</option>
              <option value="제품">제품</option>
            </select>
          </label>
          {showLanguageFilter && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">언어</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as DocumentLanguage)}
                className="border rounded-md px-2 py-1.5"
              >
                <option value="국문">국문</option>
                <option value="영문">영문</option>
                <option value="기타">기타</option>
              </select>
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">품목명</span>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{dateLabel}</span>
          <input
            type="date"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">파일 (PDF 등, 15MB 이하)</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
          {fileError && <span className="text-xs text-red-600">{fileError}</span>}
          {file && <span className="text-xs text-slate-500">선택된 파일: {file.name}</span>}
        </label>
        <div className="flex items-center gap-3 mt-1">
          <button
            type="submit"
            disabled={busy || !itemName.trim() || !file}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            업로드
          </button>
          {message && <span className="text-sm text-red-600">{message}</span>}
        </div>
      </form>
    </Modal>
  );
}
