"use client";

import DocumentLibrary from "@/components/DocumentLibrary";

export default function TestReportsPage() {
  return (
    <DocumentLibrary
      docType="test_report"
      title="외부기관 시험성적서"
      description="기간·원료/제품·품목명·언어로 조회하고 PDF를 바로 다운로드합니다."
      dateLabel="시험일자"
      showLanguageFilter
    />
  );
}
