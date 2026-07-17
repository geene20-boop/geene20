"use client";

import { useRef, useState } from "react";

type ImportResult = { inserted: number; updated: number; skipped: number; errors: string[] };

function UploadCard({
  title,
  description,
  kind,
}: {
  title: string;
  description: string;
  kind: "production" | "qc";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/import?kind=${kind}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "가져오기에 실패했습니다.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="text-sm border rounded-md px-2 py-1.5"
      />
      <button
        onClick={onUpload}
        disabled={busy}
        className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 w-fit"
      >
        {busy ? "가져오는 중..." : "엑셀 파일 가져오기"}
      </button>
      {result && (
        <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3">
          신규 {result.inserted}건, 갱신 {result.updated}건, 건너뜀 {result.skipped}건
          {result.errors.length > 0 && (
            <div className="text-red-500 mt-1">
              오류 {result.errors.length}건: {result.errors.slice(0, 3).join(" / ")}
            </div>
          )}
        </div>
      )}
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">데이터 가져오기</h1>
        <p className="text-sm text-slate-500 mt-1">
          기존에 쓰던 엑셀 파일(설비가동정보 / 비료시료 강도테스트)을 그대로 업로드하면 형식을
          자동으로 인식해 데이터베이스로 옮겨줍니다. 이후에는 위 입력화면으로 직접 입력하면 됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UploadCard
          title="설비가동정보 엑셀 가져오기"
          description="날짜/주야 2행 1세트 형식의 월별 생산일지 파일을 업로드하세요."
          kind="production"
        />
        <UploadCard
          title="비료시료 강도테스트 엑셀 가져오기"
          description="시료 20개 경도값 + 생산조건 형식의 QC 측정 파일을 업로드하세요."
          kind="qc"
        />
      </div>
    </div>
  );
}
