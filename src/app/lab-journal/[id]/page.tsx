"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDelete, apiGet } from "@/lib/apiClient";
import { useSiteSession } from "@/lib/useSiteSession";
import { DocumentFile, LabJournal } from "@/lib/types";
import { FreeformContent, ItemizedContent, LinkedContent } from "@/lib/labJournalContent";
import DocumentPreview from "@/components/DocumentPreview";

export default function LabJournalViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSiteSession();
  const [entry, setEntry] = useState<LabJournal | null>(null);
  const [linkedReport, setLinkedReport] = useState<DocumentFile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiGet<LabJournal>(`/api/lab-journal/${params.id}`)
      .then(setEntry)
      .catch(() => setNotFound(true));
  }, [params.id]);

  useEffect(() => {
    if (!entry?.linked_report_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedReport(null);
      return;
    }
    apiGet<DocumentFile>(`/api/documents/${entry.linked_report_id}`)
      .then(setLinkedReport)
      .catch(() => setLinkedReport(null));
  }, [entry?.linked_report_id]);

  async function remove() {
    if (!entry || !confirm("이 실험일지를 삭제할까요?")) return;
    await apiDelete(`/api/lab-journal/${entry.id}`);
    router.push("/lab-journal");
  }

  if (notFound) return <p className="text-sm text-slate-400">실험일지를 찾을 수 없습니다.</p>;
  if (!entry) return <p className="text-sm text-slate-400">불러오는 중...</p>;

  const content = JSON.parse(entry.content_json) as ItemizedContent | FreeformContent | LinkedContent;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Link href="/lab-journal" className="text-xs text-slate-500 hover:underline">
            ← 목록으로
          </Link>
          <h1 className="text-xl font-bold mt-1">{entry.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            🖨️ 인쇄 / PDF저장
          </button>
          {session.canWrite && (
            <Link
              href={`/lab-journal/${entry.id}/edit`}
              className="border rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              수정
            </Link>
          )}
          {session.isAdmin && (
            <button onClick={remove} className="text-red-500 hover:underline text-sm">
              삭제
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-10 print:border-0 print:rounded-none print:p-0 flex flex-col gap-4">
        <h2 className="text-center text-2xl font-bold mb-4 tracking-wide">연구실험일지</h2>
        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            <tr className="border-b">
              <th className="w-32 text-left bg-slate-50 px-3 py-2 font-semibold text-slate-600">양식</th>
              <td className="px-3 py-2">{entry.form_type}</td>
              <th className="w-32 text-left bg-slate-50 px-3 py-2 font-semibold text-slate-600">일자</th>
              <td className="px-3 py-2">{entry.date}</td>
            </tr>
            <tr className="border-b">
              <th className="text-left bg-slate-50 px-3 py-2 font-semibold text-slate-600">연구자</th>
              <td className="px-3 py-2">{entry.researcher ?? "-"}</td>
              <th className="text-left bg-slate-50 px-3 py-2 font-semibold text-slate-600">품목명</th>
              <td className="px-3 py-2">{entry.item_name ?? "-"}</td>
            </tr>
          </tbody>
        </table>

        {entry.form_type === "항목형" && <ItemizedView content={content as ItemizedContent} />}
        {entry.form_type === "자유기술형" && <FreeformView content={content as FreeformContent} />}
        {entry.form_type === "외부시험연동형" && (
          <LinkedView content={content as LinkedContent} report={linkedReport} />
        )}
      </div>
    </div>
  );
}

function ItemizedView({ content }: { content: ItemizedContent }) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="실험목적" text={content.purpose} />
      <Section title="실험방법" text={content.method} />
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">측정항목</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="border px-3 py-1.5 text-left">항목명</th>
              <th className="border px-3 py-1.5 text-left">값</th>
              <th className="border px-3 py-1.5 text-left">단위</th>
            </tr>
          </thead>
          <tbody>
            {content.items.map((row, idx) => (
              <tr key={idx}>
                <td className="border px-3 py-1.5">{row.name}</td>
                <td className="border px-3 py-1.5">{row.value}</td>
                <td className="border px-3 py-1.5">{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Section title="결론" text={content.conclusion} />
    </div>
  );
}

function FreeformView({ content }: { content: FreeformContent }) {
  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content.content}</p>;
}

function LinkedView({ content, report }: { content: LinkedContent; report: DocumentFile | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">연동된 외부기관 시험성적서</h3>
        {report ? (
          <div className="flex flex-col gap-2">
            <DocumentPreview fileId={report.id} mimeType={report.mime_type} filename={report.filename} />
            <a
              href={`/api/documents/file/${report.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline text-sm print:hidden"
            >
              새 탭에서 열기
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-400">연동된 문서가 없습니다.</p>
        )}
      </div>
      <Section title="해석/소견" text={content.interpretation} />
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-1">{title}</h3>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{text || "-"}</p>
    </div>
  );
}
