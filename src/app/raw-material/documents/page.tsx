"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { RawMaterial, RawMaterialDocType, RawMaterialDocument, RAW_MATERIAL_DOC_LABELS } from "@/lib/types";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { materialLabel, shiftDate, todayStr } from "@/lib/rawMaterialClient";
import { useSiteSession } from "@/lib/useSiteSession";

type PrefillRow = {
  date: string;
  materialKey?: string;
  materialName: string;
  category?: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  supplierCountry?: string;
  qty: number | null;
  note: string;
  isPlaceholder?: boolean;
  included: boolean;
};

type Form40Meta = {
  companyName: string;
  companyCeo: string;
  companyAddress: string;
  materialName: string;
  disclosureNo: string;
  disclosureDate: string;
  materialType: string;
  mainIngredients: string;
  disclosureValidFrom: string;
  disclosureValidTo: string;
};

const DOC_TYPES: RawMaterialDocType[] = ["form19_2", "form40"];
const DOC_DESC: Record<RawMaterialDocType, string> = {
  form19_2: "비료관리법 시행규칙 · 비료의 제조 원료 장부",
  form40: "유기농업자재 공시 원료·재료 수급대장",
};

export default function RawMaterialDocumentsPage() {
  const [docType, setDocType] = useState<RawMaterialDocType>("form19_2");
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialKey, setMaterialKey] = useState("");
  const [form40MaterialKeys, setForm40MaterialKeys] = useState<string[]>([]);
  const [targetMaterial, setTargetMaterial] = useState("");
  const [from, setFrom] = useState(shiftDate(todayStr(), -30));
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState<PrefillRow[]>([]);
  const [meta, setMeta] = useState<Form40Meta | null>(null);
  const [memo, setMemo] = useState("");
  const [documents, setDocuments] = useState<RawMaterialDocument[]>([]);
  const [docFrom, setDocFrom] = useState(shiftDate(todayStr(), -90));
  const [docTo, setDocTo] = useState(todayStr());
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const session = useSiteSession();

  async function loadDocuments(f?: string, t?: string) {
    setDocuments(
      await apiGet<RawMaterialDocument[]>(`/api/raw-material-document?from=${f ?? docFrom}&to=${t ?? docTo}`)
    );
  }

  useEffect(() => {
    apiGet<RawMaterial[]>("/api/raw-material").then(setMaterials);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materialByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  function toggleForm40Material(key: string) {
    setForm40MaterialKeys((keys) => {
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      // 대표(맨 처음 체크한) 원재료가 바뀌면, 대상 비종을 아직 직접 입력하지 않은 경우에 한해
      // 공시서에 기재된 공식 자재명(disclosure_material_name)을 자동으로 채워준다.
      if (next.length > 0 && next[0] !== keys[0]) {
        const rep = materialByKey.get(next[0]);
        if (rep?.disclosure_material_name) {
          const autoName = rep.disclosure_material_name;
          setTargetMaterial((cur) => (cur.trim() === "" ? autoName : cur));
        }
      }
      return next;
    });
  }

  async function preview() {
    setMessage(null);
    setMeta(null);
    if (docType === "form40" && form40MaterialKeys.length === 0) {
      setMessage("별지 제40호서식은 원재료(자재)를 1개 이상 선택해야 합니다.");
      return;
    }
    const params = new URLSearchParams({ docType, from, to });
    if (docType === "form40") {
      params.set("materialKeys", form40MaterialKeys.join(","));
    } else if (materialKey) {
      params.set("materialKey", materialKey);
    }
    const res = await apiGet<{ rows: Omit<PrefillRow, "included">[]; meta?: Form40Meta | null; error?: string }>(
      `/api/raw-material-document/prefill?${params.toString()}`
    );
    setRows((res.rows ?? []).map((r) => ({ ...r, included: true })));
    setMeta(res.meta ?? null);
    if (!res.rows || res.rows.length === 0) setMessage("조건에 맞는 데이터가 없습니다.");
  }

  function updateRow(i: number, patch: Partial<PrefillRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function toggleAllRows(value: boolean) {
    setRows((rs) => rs.map((r) => ({ ...r, included: value })));
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
    const payload = {
      entered_by: enteredBy,
      docType,
      title: RAW_MATERIAL_DOC_LABELS[docType],
      targetMaterial:
        targetMaterial ||
        (docType === "form40"
          ? form40MaterialKeys.map((k) => materialLabel(materialByKey.get(k)!)).join(", ") || null
          : materialKey
            ? materialLabel(materialByKey.get(materialKey)!)
            : null),
      periodFrom: from,
      periodTo: to,
      rows,
      meta,
      memo: memo || null,
    };
    try {
      if (editingId) {
        await apiPut(`/api/raw-material-document/${editingId}`, payload);
        setMessage("문서가 수정되었습니다.");
        setEditingId(null);
      } else {
        await apiPost("/api/raw-material-document", payload);
        setMessage("문서함에 저장되었습니다.");
      }
      setMemo("");
      await loadDocuments();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  function startEditDocument(d: RawMaterialDocument) {
    const parsed = JSON.parse(d.data_json);
    const parsedRows: PrefillRow[] = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
    const parsedMeta: Form40Meta | null = Array.isArray(parsed) ? null : (parsed.meta ?? null);
    setEditingId(d.id);
    setDocType(d.doc_type);
    setMaterialKey("");
    setForm40MaterialKeys([]);
    setTargetMaterial(d.target_material ?? "");
    if (d.period_from) setFrom(d.period_from);
    if (d.period_to) setTo(d.period_to);
    setRows(parsedRows.map((r) => ({ ...r, included: r.included !== false })));
    setMeta(parsedMeta);
    setMessage(`"${d.target_material ?? RAW_MATERIAL_DOC_LABELS[d.doc_type]}" 문서를 수정 중입니다.`);
  }

  function cancelEdit() {
    setEditingId(null);
    setRows([]);
    setMeta(null);
    setMessage(null);
  }

  async function removeDocument(id: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    if (!confirm("이 문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await apiDelete(`/api/raw-material-document/${id}`, { entered_by: enteredBy });
      if (editingId === id) cancelEdit();
      await loadDocuments();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    }
  }

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">양식출력</h1>
        <p className="text-sm text-slate-500 mt-1">
          양식을 선택하고 기간·품목을 지정하면 입고대장 데이터가 자동으로 채워집니다. 서식에 넣을 행만
          체크한 뒤 저장하면 문서함에 남아 언제든 다시 조회·PDF 다운로드할 수 있습니다.
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
                  setMaterialKey("");
                  setForm40MaterialKeys([]);
                  setMeta(null);
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

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">대상 비종 (비료의 종류)</span>
            <input
              value={targetMaterial}
              onChange={(e) => setTargetMaterial(e.target.value)}
              className="border rounded-md px-2 py-1.5"
              placeholder="예: 입상석회고토"
            />
          </label>
          {docType === "form40" ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">원재료 (자재 1개 이상 선택 — 필수)</span>
              <div className="border rounded-md px-2 py-2 max-h-40 overflow-y-auto flex flex-col gap-1">
                {materials.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form40MaterialKeys.includes(m.key)}
                      onChange={() => toggleForm40Material(m.key)}
                    />
                    {materialLabel(m)}
                    {form40MaterialKeys[0] === m.key && (
                      <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-1.5">
                        대표(공시정보 기준)
                      </span>
                    )}
                  </label>
                ))}
                {materials.length === 0 && <span className="text-xs text-slate-400">등록된 원재료가 없습니다.</span>}
              </div>
              <span className="text-[11px] text-slate-400">
                여러 원료가 하나의 공시 자재에 함께 쓰이면 모두 체크하세요. 공시번호·주성분함량 등은
                맨 처음 체크한(대표) 원재료의 &ldquo;공시정보&rdquo; 값을 사용합니다.
              </span>
            </div>
          ) : (
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
          )}
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

          <button onClick={preview} className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium">
            데이터 불러오기
          </button>
        </div>

        <div className="bg-white rounded-xl border p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700">② 데이터 미리보기</h2>

          {docType === "form40" && meta && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5 text-xs grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
              <div><span className="text-slate-500">업체명</span> {meta.companyName || "-"}</div>
              <div><span className="text-slate-500">대표자</span> {meta.companyCeo || "-"}</div>
              <div><span className="text-slate-500">사업장 소재지</span> {meta.companyAddress || "-"}</div>
              <div><span className="text-slate-500">공시번호</span> {meta.disclosureNo || "-"}</div>
              <div><span className="text-slate-500">자재구분</span> {meta.materialType || "-"}</div>
              <div><span className="text-slate-500">주성분함량</span> {meta.mainIngredients || "-"}</div>
              <div className="col-span-2 md:col-span-3">
                <span className="text-slate-500">공시 유효기간</span> {meta.disclosureValidFrom || "-"} ~ {meta.disclosureValidTo || "-"}
              </div>
              {!meta.companyName && (
                <div className="col-span-2 md:col-span-3 text-amber-700">
                  회사정보가 비어있습니다. 관리자 설정 &gt; 회사정보에서 등록해주세요.
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {includedCount} / {rows.length}개 행이 서식에 포함됩니다.
              </span>
              <span className="flex gap-2">
                <button onClick={() => toggleAllRows(true)} className="text-sky-700 underline">
                  전체선택
                </button>
                <button onClick={() => toggleAllRows(false)} className="text-sky-700 underline">
                  전체해제
                </button>
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="border px-2 py-1.5"></th>
                  <th className="border px-2 py-1.5">원료구입일</th>
                  <th className="border px-2 py-1.5">원재료</th>
                  <th className="border px-2 py-1.5">공급처</th>
                  <th className="border px-2 py-1.5">공급처 주소</th>
                  <th className="border px-2 py-1.5">공급처 전화번호</th>
                  {docType === "form19_2" && <th className="border px-2 py-1.5">생산국가</th>}
                  <th className="border px-2 py-1.5">수량(KG)</th>
                  {docType === "form40" && <th className="border px-2 py-1.5">비고</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.isPlaceholder ? "bg-amber-50/60" : ""}>
                    <td className="border px-2 py-1.5 text-center">
                      <input type="checkbox" checked={r.included} onChange={(e) => updateRow(i, { included: e.target.checked })} />
                    </td>
                    <td className="border px-2 py-1.5 text-center whitespace-nowrap">
                      {r.date}
                      {r.isPlaceholder && (
                        <span className="ml-1 text-[9px] text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">자동생성</span>
                      )}
                    </td>
                    <td className="border px-2 py-1.5">{r.materialName}</td>
                    <td className="border px-2 py-1.5">{r.supplierName || "-"}</td>
                    <td className="border px-2 py-1.5">{r.supplierAddress || "-"}</td>
                    <td className="border px-2 py-1.5">{r.supplierPhone || "-"}</td>
                    {docType === "form19_2" && (
                      <td className="border px-1 py-1">
                        <input
                          value={r.supplierCountry ?? ""}
                          onChange={(e) => updateRow(i, { supplierCountry: e.target.value })}
                          className="border rounded px-1.5 py-1 w-20 text-xs"
                          placeholder="한국"
                        />
                      </td>
                    )}
                    <td className="border px-2 py-1.5 text-right tabular-nums">
                      {r.qty == null ? "-" : r.qty.toLocaleString()}
                    </td>
                    {docType === "form40" && (
                      <td className="border px-1 py-1">
                        <input
                          value={r.note ?? ""}
                          onChange={(e) => updateRow(i, { note: e.target.value })}
                          className="border rounded px-1.5 py-1 w-24 text-xs"
                          placeholder="비고"
                        />
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="border px-2 py-6 text-center text-slate-400">
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
          <div className="flex justify-end gap-2">
            {editingId && (
              <button onClick={cancelEdit} className="border rounded-md px-3 py-2 text-sm">
                취소
              </button>
            )}
            <button onClick={save} className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-semibold">
              {editingId ? "수정 저장" : "저장 → 문서함에 등록"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">③ 문서함 — 저장된 문서 이력</h2>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">발급일 시작</span>
              <input
                type="date"
                value={docFrom}
                onChange={(e) => setDocFrom(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">발급일 종료</span>
              <input
                type="date"
                value={docTo}
                onChange={(e) => setDocTo(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => loadDocuments()}
              className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-xs font-medium"
            >
              조회
            </button>
          </div>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">발급일</th>
              <th className="text-left px-3 py-2">양식종류</th>
              <th className="text-left px-3 py-2">대상</th>
              <th className="text-left px-3 py-2">조회기간</th>
              <th className="text-left px-3 py-2">작성자</th>
              <th className="text-left px-3 py-2">다운로드</th>
              {session.canWrite && <th className="text-left px-3 py-2">관리</th>}
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className={`border-t ${editingId === d.id ? "bg-sky-50" : ""}`}>
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
                    PDF
                  </a>
                </td>
                {session.canWrite && (
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditDocument(d)}
                        className="text-xs border rounded-md px-2 py-1 bg-white"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => removeDocument(d.id)}
                        className="text-xs border rounded-md px-2 py-1 bg-white text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={session.canWrite ? 7 : 6} className="px-3 py-8 text-center text-slate-400">
                  해당 기간에 저장된 문서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
