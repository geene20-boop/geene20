"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useEnteredBy } from "@/lib/useEnteredBy";
import EnteredByField from "@/components/EnteredByField";
import { useSiteSession } from "@/lib/useSiteSession";
import { KIND_LABELS } from "@/lib/packingClient";

interface DailyLogRow {
  key: string;
  label: string;
  unit: string | null;
  prevStock: number;
  packedQty: number;
  shippedQty: number;
  usedQty: number;
  restockedQty: number;
  returnedQty: number;
  breakageQty: number;
  currentStock: number;
}

interface DailyLogResult {
  products: DailyLogRow[];
  bagmats: DailyLogRow[];
  auxes: DailyLogRow[];
  breakages: { key: string; label: string; qty: number; worker: string | null }[];
  returns: { key: string; label: string; qty: number; worker: string | null }[];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, delta: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fmt(v: number | null | undefined): string {
  return v == null ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function signed(v: number): string {
  if (v === 0) return "-";
  return v > 0 ? `+${fmt(v)}` : fmt(v);
}

export default function PackingDailyLogPage() {
  const [tab, setTab] = useState<"product" | "bagmat" | "aux">("product");
  const [date, setDate] = useState(today());
  const [data, setData] = useState<DailyLogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [breakKey, setBreakKey] = useState<string | null>(null);
  const [breakQty, setBreakQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { enteredBy, setEnteredBy } = useEnteredBy();
  const [nameError, setNameError] = useState(false);
  const session = useSiteSession();

  useEffect(() => {
    if (session.loggedIn && session.displayName) {

      setEnteredBy(session.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loggedIn, session.displayName]);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<DailyLogResult>(`/api/packing-daily-log?date=${date}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const kindByRow = useMemo(() => {
    const map = new Map<string, "product" | "bagmat" | "aux">();
    for (const r of data?.products ?? []) map.set(r.key, "product");
    for (const r of data?.bagmats ?? []) map.set(r.key, "bagmat");
    for (const r of data?.auxes ?? []) map.set(r.key, "aux");
    return map;
  }, [data]);

  async function submitBreakage(key: string) {
    if (!enteredBy.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/packing-breakage", {
        entered_by: enteredBy,
        date,
        key,
        kind: kindByRow.get(key) ?? null,
        qty: Number(breakQty),
      });
      setMessage("파포수량이 반영되었습니다.");
      setBreakKey(null);
      setBreakQty("");
      await load();
    } catch (err) {
      setMessage(`오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function renderTable(title: string, rows: DailyLogRow[], allowBreakage: boolean) {
    return (
      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">{title}</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">전일재고</th>
              <th className="text-right px-3 py-2">포장/생산</th>
              <th className="text-right px-3 py-2">출고</th>
              <th className="text-right px-3 py-2">사용</th>
              <th className="text-right px-3 py-2">입고</th>
              <th className="text-right px-3 py-2">반품</th>
              <th className="text-right px-3 py-2">파손</th>
              <th className="text-right px-3 py-2">현재재고</th>
              {allowBreakage && <th className="text-right px-3 py-2">파포입력</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {fmt(r.prevStock)}
                  {r.unit ?? ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{signed(r.packedQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.shippedQty ? `-${fmt(r.shippedQty)}` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.usedQty ? `-${fmt(r.usedQty)}` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{signed(r.restockedQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{signed(r.returnedQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.breakageQty ? `-${fmt(r.breakageQty)}` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {fmt(r.currentStock)}
                  {r.unit ?? ""}
                </td>
                {allowBreakage && (
                  <td className="px-3 py-2 text-right">
                    {breakKey === r.key ? (
                      <div className={`flex items-center justify-end gap-1 ${!session.canWrite ? "opacity-50 pointer-events-none" : ""}`}>
                        <input
                          type="number"
                          value={breakQty}
                          onChange={(e) => setBreakQty(e.target.value)}
                          className="border rounded-md px-2 py-1 w-20 text-right"
                          placeholder="수량"
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submitBreakage(r.key)}
                          className="text-xs border rounded-md px-2 py-1 bg-slate-900 text-white disabled:opacity-50"
                        >
                          반영
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBreakKey(null);
                            setBreakQty("");
                          }}
                          className="text-xs border rounded-md px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBreakKey(r.key);
                          setBreakQty("");
                        }}
                        disabled={!session.canWrite}
                        className="text-xs border rounded-md px-2 py-1 text-red-600 disabled:opacity-40 disabled:text-slate-400"
                      >
                        파포입력
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={allowBreakage ? 10 : 9} className="px-3 py-6 text-center text-slate-400">
                  등록된 품목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">포장일지 조회</h1>
        <p className="text-sm text-slate-500 mt-1">
          날짜별 전일재고 → 포장/출고/사용/입고/반품/파손 → 현재재고 흐름을 확인합니다. (전일재고는 현재
          실재고 기준으로 자동 역산되며, 과거값을 직접 수정할 수는 없습니다.)
        </p>
      </div>

      {!session.canWrite && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          조회 전용 계정입니다. 파포수량 입력은 editor 권한이 필요합니다.
        </div>
      )}

      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} className="border rounded-md px-2 py-1 text-xs">
            ◀ 전날
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-2 py-1 text-xs" />
          <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} className="border rounded-md px-2 py-1 text-xs">
            다음날 ▶
          </button>
          <button type="button" onClick={() => setDate(today())} className="border rounded-md px-2 py-1 text-xs">
            오늘
          </button>
        </div>
        <div className="w-56">
          <EnteredByField
            value={enteredBy}
            onChange={setEnteredBy}
            error={nameError}
            lockedValue={session.loggedIn ? session.displayName : null}
          />
        </div>
        {loading && <span className="text-xs text-slate-400">불러오는 중...</span>}
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "product", label: KIND_LABELS.product },
            { key: "bagmat", label: KIND_LABELS.bagmat },
            { key: "aux", label: KIND_LABELS.aux },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "product" && renderTable(`${KIND_LABELS.product} 포장 현황`, data?.products ?? [], true)}
      {tab === "bagmat" && renderTable(`${KIND_LABELS.bagmat} 재고 현황`, data?.bagmats ?? [], true)}
      {tab === "aux" && renderTable(`${KIND_LABELS.aux} 재고 현황`, data?.auxes ?? [], true)}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">4. 파손(파포) 내역 ({date})</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">작업자</th>
            </tr>
          </thead>
          <tbody>
            {(data?.breakages ?? []).map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">-{fmt(r.qty)}</td>
                <td className="px-3 py-2">{r.worker ?? "-"}</td>
              </tr>
            ))}
            {(data?.breakages ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  해당일 파손 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 px-4 pt-4">5. 반품 내역 ({date})</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">품목</th>
              <th className="text-right px-3 py-2">수량</th>
              <th className="text-left px-3 py-2">작업자</th>
            </tr>
          </thead>
          <tbody>
            {(data?.returns ?? []).map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">+{fmt(r.qty)}</td>
                <td className="px-3 py-2">{r.worker ?? "-"}</td>
              </tr>
            ))}
            {(data?.returns ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  해당일 반품 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="border rounded-md px-4 py-1.5 text-sm font-medium bg-white"
        >
          ↑ 맨 위로
        </button>
      </div>
    </div>
  );
}
