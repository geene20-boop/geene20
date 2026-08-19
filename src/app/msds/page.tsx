"use client";

import DocumentLibrary from "@/components/DocumentLibrary";

export default function MsdsPage() {
  return (
    <DocumentLibrary
      docType="msds"
      title="MSDS 자료"
      description="원료/제품·품목명으로 조회하고 PDF로 다운로드합니다. 같은 품목명 중 가장 최근 개정일자만 최신본입니다."
      dateLabel="개정일자"
      showLanguageFilter={false}
      markStale
    />
  );
}
