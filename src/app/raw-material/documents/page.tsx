"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import {
  RawMaterial,
  RawMaterialDocType,
  RawMaterialDocument,
  RawMaterialInbound,
  RAW_MATERIAL_DOC_LABELS,
} from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { materialLabel, shiftDate, todayStr } from "@/lib/rawMaterialClient";

type PrefillRow = {
  date: string;
  materialKey?: string;
  materialName: string;
  category?: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  qty: number;
  unit: string;
  unitPrice?: number | string;
  amount?: number | string;
  vehicleNo?: string;
  judgment?: "OK" | "NG";
  problem?: string;
  reason?: string;
  actionTaken?: string;
  judgedBy?: string;
  note?: string;
};

const DOC_TYPES: RawMaterialDocType[] = ["form19_2", "form40", "inbound_certificate", "product_certificate"];
const DOC_DESC: Record<RawMaterialDocType, string> = {
  form19_2: "비료관리법 시행규칙 · 비료의 제조 원료 장부",
  form40: "유기농업자재 공시 원료·재료 수급대장",
  inbound_certificate: "사내 자체 양식 · 기간별 입고검수 결과",
  product_certificate: "개별 입고 건의 시험성적서 형식 증명 문서",
};

export default function RawMaterialDocumentsPage() {
  const [docType, setDocType] = useState<RawMaterialDocType>("form19_2");
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialKey, setMaterialKey] = useState("");
  const [targetMaterial, setTargetMaterial] = useState("");
  const [from, setFrom] = useState(shiftDate(todayStr(), -30));
  const [to, setTo] = useState(todayStr());
  const [recentInbound, setRecentInbound] = useState<RawMaterialInbound[]>([]);
  const [inboundId, setInboundId] = useState("");
  const [rows, setRows] = useState<PrefillRow[]>([]);
  const [memo, setMemo] = useState("");
  const [documents, setDocuments] = useState<RawMaterialDocument[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);

  async function loadDocuments() {
    setDocuments(await apiGet<RawMaterialDocument[]>("/api/raw-material-document"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    apiGet<RawMaterialInbound[]>(`/api/raw-material-inbound?from=${shiftDate(todayStr(), -90)}&to=${todayStr()}`).then(
      setRecentInbound
    );
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  async function preview() {
    setMessage(null);
    const params = new URLSearchParams({ docType });
    if (docType === "product_certificate") {
      if (!inboundId) {
        setMessage("입고 건을 선택해주세요.");
        return;
      }
      params.set("inboundId", inboundId);
    } else {
      params.set("from", from);
      params.set("to", to);
      if (materialKey) params.set("materialKey", materialKey);
    }
    const res = await apiGet<{ rows: PrefillRow[]; error?: string }>(`/api/raw-material-document/prefill?${params.toString()}`);
    setRows(res.rows ?? []);
    if (!res.rows || res.rows.length === 0) setMessage("조건에 맞는 데이터가 없습니다.");
  }

  async function save() {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (rows.length === 0) {
      setMessage("먼저 데이터를 미리보기로 불러와주세요.");
      return;
    }
    setNameError(false);
    try {
      await apiPost("/api/raw-material-document", {
        entered_by: enteredBy,
        docType,
        title: RAW_MATERIAL_DOC_LABELS[docType],
        targetMaterial: targetMaterial || (materialKey ? materialLabel(materialByKey.get(materialKey)!) : null),
        periodFrom: docType === "product_certificate" ? null : from,
        periodTo: docType === "product_certificate" ? null : to,
        rows,
        memo: memo || null,
      });
      setMessage("문서함에 저장되었습니다.");
      setMemo("");
      await loadDocuments();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">양식출력</h1>
        <p className="text-sm text-slate-500 mt-1">
          양식을 선택하고 기간·품목을 지정하면 입고대장 데이터가 자동으로 채워집니다. 저장하면
          문서함에 남아 언제든 다시 조회·다운로드할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700">① 양식 종류</h2>
          <div className="flex flex-col gap-2">
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setDocType(t);
                  setRows([]);
                  setInboundId("");
                }}
                className={`text-left border rounded-lg px-3 py-2 ${
                  docType === t ? "border-slate-900 bg-slate-50" : "border-slate-200"
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">{RAW_MATERIAL_DOC_LABELS[t]}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{DOC_DESC[t]}</div>
              </button>
            ))}
          </div>

          {docType !== "product_certificate" ? (
            <>
              {(docType === "form19_2" || docType === "form40") && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">대상 비종 (비료의 종류)</span>
                  <input
                    value={targetMaterial}
                    onChange={(e) => setTargetMaterial(e.target.value)}
                    className="border rounded-md px-2 py-1.5"
                    placeholder="예: 입상석회고토"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">원재료 (선택 시 해당 품목만)</span>
                <select value={materialKey} onChange={(e) => setMaterialKey(e.target.value)} className="border rounded-md px-2 py-1.5">
                  <option value="">전체</option>
                  {materials.map((m) => (
                    <option key={m.key} value={m.key}>
                      {materialLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">조회 시작일</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1.5" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">조회 종료일</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1.5" />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">원재료로 조회 (목록 좁히기)</span>
                <select
                  value={materialKey}
                  onChange={(e) => {
                    setMaterialKey(e.target.value);
                    setInboundId("");
                  }}
                  className="border rounded-md px-2 py-1.5"
                >
                  <option value="">전체</option>
                  {materials.map((m) => (
                    <option key={m.key} value={m.key}>
                      {materialLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">대상 입고 건 (최근 90일)</span>
                <select value={inboundId} onChange={(e) => setInboundId(e.target.value)} className="border rounded-md px-2 py-1.5">
                  <option value="">선택</option>
                  {recentInbound
                    .filter((r) => !materialKey || r.material_key === materialKey)
                    .map((r) => {
                      const material = materialByKey.get(r.material_key);
                      return (
                        <option key={r.id} value={r.id}>
                          {r.date} · {material ? materialLabel(material) : r.material_key} · {r.supplier_name ?? "-"} ({r.judgment})
                        </option>
                      );
                    })}
                </select>
                {materialKey && recentInbound.filter((r) => r.material_key === materialKey).length === 0 && (
                  <span className="text-[11px] text-amber-600">선택한 원재료의 최근 90일 입고 건이 없습니다.</span>
                )}
              </label>
            </>
          )}

          <button onClick={preview} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            데이터 불러오기
          </button>
        </div>

        <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700">② 데이터 미리보기</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="border px-2 py-1.5">원료구입일</th>
                  <th className="border px-2 py-1.5">원재료</th>
                  <th className="border px-2 py-1.5">공급처</th>
                  <th className="border px-2 py-1.5">공급처 주소</th>
                  <th className="border px-2 py-1.5">공급처 전화번호</th>
                  <th className="border px-2 py-1.5">수량</th>
                  {docType === "product_certificate" && (
                    <>
                      <th className="border px-2 py-1.5">판정</th>
                      <th className="border px-2 py-1.5">문제점</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1.5 text-center">{r.date}</td>
                    <td className="border px-2 py-1.5">{r.materialName}</td>
                    <td className="border px-2 py-1.5">{r.supplierName || "-"}</td>
                    <td className="border px-2 py-1.5">{r.supplierAddress || "-"}</td>
                    <td className="border px-2 py-1.5">{r.supplierPhone || "-"}</td>
                    <td className="border px-2 py-1.5 text-right">
                      {r.qty}
                      {r.unit}
                    </td>
                    {docType === "product_certificate" && (
                      <>
                        <td className="border px-2 py-1.5 text-center">{r.judgment}</td>
                        <td className="border px-2 py-1.5">{r.problem || "-"}</td>
                      </>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="border px-2 py-6 text-center text-slate-400">
                      &ldquo;데이터 불러오기&rdquo;를 눌러 미리보기를 확인하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <EnteredByField value={enteredBy} onChange={setEnteredBy} error={nameError} lockedValue={null} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">이 문서에만 남길 메모 (문서별 개별 저장)</span>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className="border rounded-md px-2 py-1.5" />
          </label>

          {message && <p className="text-sm text-slate-600">{message}</p>}
          <div className="flex justify-end">
            <button onClick={save} className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-semibold">
              저장 → 문서함에 등록
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">③ 문서함 — 저장된 문서 이력</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">발급일</th>
              <th className="text-left px-3 py-2">양식종류</th>
              <th className="text-left px-3 py-2">대상</th>
              <th className="text-left px-3 py-2">조회기간</th>
              <th className="text-left px-3 py-2">작성자</th>
              <th className="text-left px-3 py-2">다운로드</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2">{d.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2">{RAW_MATERIAL_DOC_LABELS[d.doc_type]}</td>
                <td className="px-3 py-2">{d.target_material ?? "-"}</td>
                <td className="px-3 py-2">{d.period_from ? `${d.period_from} ~ ${d.period_to}` : "-"}</td>
                <td className="px-3 py-2">{d.created_by ?? "-"}</td>
                <td className="px-3 py-2">
                  <a
                    href={`/api/raw-material-document/${d.id}/export`}
                    className="text-xs border rounded-md px-2 py-1 bg-emerald-700 text-white inline-block"
                  >
                    엑셀
                  </a>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  저장된 문서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
