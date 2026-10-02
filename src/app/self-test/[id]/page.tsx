"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SelfTestCertificate } from "@/lib/types";
import { apiGet } from "@/lib/apiClient";

export default function SelfTestCertificateViewPage() {
  const params = useParams<{ id: string }>();
  const [cert, setCert] = useState<SelfTestCertificate | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiGet<SelfTestCertificate>(`/api/self-test-certificate/${params.id}`)
      .then(setCert)
      .catch(() => setNotFound(true));
  }, [params.id]);

  if (notFound) return <p className="text-sm text-slate-400">발행 이력을 찾을 수 없습니다.</p>;
  if (!cert) return <p className="text-sm text-slate-400">불러오는 중...</p>;

  const isEnglish = cert.language === "영문";

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">자체시험성적서</h1>
        <button
          onClick={() => window.print()}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium"
        >
          🖨️ 인쇄 / PDF저장
        </button>
      </div>

      <div className="bg-white rounded-xl border p-10 print:border-0 print:rounded-none print:p-0">
        <h2 className="text-center text-2xl font-bold mb-8 tracking-wide">
          {isEnglish ? "SELF TEST REPORT" : "자체시험성적서"}
        </h2>

        <table className="w-full text-sm border-collapse">
          <tbody>
            <Row label={isEnglish ? "Report No." : "성적서 번호"} value={cert.report_no ?? "-"} />
            <Row label={isEnglish ? "Issued Date" : "발행일자"} value={cert.issued_date} />
            <Row label={isEnglish ? "Item" : "품목명"} value={cert.item_name} />
            <Row label={isEnglish ? "Specification" : "규격"} value={cert.specification ?? "-"} multiline />
            <Row label={isEnglish ? "Result" : "결과값"} value={cert.result ?? "-"} multiline />
            <Row label={isEnglish ? "Remarks" : "비고"} value={cert.remarks ?? "-"} multiline />
            <Row label={isEnglish ? "Consignee" : "발송처"} value={cert.consignee ?? "-"} />
            <Row label={isEnglish ? "Issued By" : "발행자"} value={cert.issued_by} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <tr className="border-b">
      <th className="w-40 text-left align-top bg-slate-50 px-3 py-2.5 font-semibold text-slate-600">{label}</th>
      <td className={`px-3 py-2.5 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</td>
    </tr>
  );
}
