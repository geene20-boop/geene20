"use client";

import { useEffect, useRef, useState } from "react";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import AdminLoginModal, { useAdminSession } from "@/components/AdminUnlock";

type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  skippedDetails?: string[];
  structureError?: string;
};

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
      {result?.structureError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {result.structureError}
        </div>
      )}
      {result && !result.structureError && (
        <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3">
          신규 {result.inserted}건, 갱신 {result.updated}건, 건너뜀 {result.skipped}건
          {result.errors.length > 0 && (
            <div className="text-red-500 mt-1">
              오류 {result.errors.length}건: {result.errors.slice(0, 3).join(" / ")}
            </div>
          )}
          {result.skippedDetails && result.skippedDetails.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-slate-500">건너뛴 항목 상세 보기</summary>
              <ul className="mt-1 list-disc list-inside text-slate-500">
                {result.skippedDetails.slice(0, 20).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

function syncStatusOf(iso: string): { label: string; stale: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 1000 / 60 / 60;
  const label = hours < 1 ? "1시간 이내" : hours < 24 ? `${Math.floor(hours)}시간 전` : `${Math.floor(hours / 24)}일 전`;
  return { label, stale: hours > 24 };
}

function PackingLogSettingCard() {
  const [url, setUrl] = useState("");
  const [syncStatus, setSyncStatus] = useState<{ label: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.packing_log_csv_url) setUrl(data.packing_log_csv_url);
      if (data.packing_log_last_sync) setSyncStatus(syncStatusOf(data.packing_log_last_sync));
    })();
  }, []);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "packing_log_csv_url", value: url.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMessage("저장되었습니다.");
    } catch (e) {
      setMessage(`오류: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/packing-log?date=${today}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "가져오기에 실패했습니다.");
      if (data.lastSync) setSyncStatus(syncStatusOf(data.lastSync));
      if (!data.configured) {
        setTestResult("먼저 URL을 저장해주세요.");
      } else if (data.error) {
        setTestResult(`오류: ${data.error}`);
      } else {
        setTestResult(
          `오늘(${today}) 톤 단위 포장량 합계: ${data.tonQty}톤` +
            (data.bagPackCount > 0
              ? ` / 포 단위 포장 ${data.bagPackCount}건(${data.bagPackQty}포, 톤 환산 안 됨)`
              : "")
        );
      }
    } catch (e) {
      setTestResult(`오류: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">포장일지(구글시트) 연동 설정</h2>
        <p className="text-sm text-slate-500 mt-1">
          포장일지 구글시트를 [파일 → 공유 → 웹에 게시 → CSV]로 게시한 뒤, 생성된 링크를 붙여넣으세요.
          저장하면 생산일지 입력 화면에서 해당 날짜의 포장량을 자동으로 참고할 수 있습니다.
        </p>
        {url && (
          <p className="text-xs mt-2">
            마지막 성공 갱신:{" "}
            {syncStatus ? (
              <span className={syncStatus.stale ? "text-amber-600" : "text-emerald-600"}>
                {syncStatus.label}
              </span>
            ) : (
              <span className="text-amber-600">아직 없음 (한 번도 성공한 적 없음)</span>
            )}
          </p>
        )}
      </div>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
        className="border rounded-md px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving || !url.trim()}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={onTest}
          disabled={testing}
          className="border border-slate-300 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {testing ? "확인 중..." : "지금 테스트 (오늘 날짜 기준)"}
        </button>
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
      {testResult && <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3">{testResult}</div>}
    </div>
  );
}

function PackingStockImportCard() {
  const admin = useAdminSession();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    admin.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!enteredBy.trim()) {
      setNameError(true);
      e.target.value = "";
      return;
    }
    setMessage("업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entered_by", enteredBy.trim());
    try {
      const res = await fetch("/api/packing-item/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      if (json.structureError) {
        setMessage(`형식 오류: ${json.structureError}`);
      } else {
        setMessage(`반영 완료: 신규 ${json.inserted}건, 갱신 ${json.updated}건, 건너뜀 ${json.skipped}건`);
      }
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-slate-800">포장일지 재고 1회성 가져오기</h2>
        <p className="text-sm text-slate-500 mt-1">
          기존 구글시트 &quot;현재고&quot; 탭을 엑셀/CSV로 내보내서 업로드하면 현재 재고 수량이
          이 앱에 반영됩니다. 최초 1회만 실행하면 되고, 이후 입고·생산·파손·반품 기록은 이 앱에서
          새로 쌓입니다. 다시 업로드해도 같은 품목은 재고 수량만 최신값으로 덮어씁니다.
        </p>
      </div>
      {admin.loggedIn ? (
        <div className="flex flex-col gap-2">
          <EnteredByField value={enteredBy} onChange={setEnteredBy} error={nameError} />
          <label className="text-sm border border-slate-300 rounded-md px-3 py-1.5 cursor-pointer w-fit bg-white">
            엑셀/CSV 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onUpload} className="hidden" />
          </label>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdminModal(true)}
          className="text-sm border border-slate-300 rounded-md px-3 py-1.5 w-fit text-slate-400"
        >
          엑셀/CSV 업로드 (관리자 전용)
        </button>
      )}
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {showAdminModal && (
        <AdminLoginModal
          onClose={() => setShowAdminModal(false)}
          onSuccess={() => {
            admin.refresh();
            setShowAdminModal(false);
          }}
        />
      )}
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

      <PackingLogSettingCard />
      <PackingStockImportCard />
    </div>
  );
}
