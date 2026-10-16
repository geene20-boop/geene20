"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { PURCHASE_PURPOSES, PURCHASE_UNITS, kstDate } from "@/lib/purchase";
import { PurchaseComment, PurchasePurpose, PurchaseView } from "@/lib/types";
import {
  BudgetDiff,
  EtaPill,
  Pill,
  PurposePill,
  Sheet,
  WaitPill,
  btn,
  btnKakao,
  btnPrimary,
  btnRed,
  fmtQty,
  fmtTs,
  inputCls,
  md,
  won,
} from "./ui";

const STATUS: Record<PurchaseView["status"], { label: string; tone: "amber" | "sky" | "green" | "slate" | "red" }> = {
  requested: { label: "승인 대기", tone: "amber" },
  ordered: { label: "발주 진행", tone: "sky" },
  received: { label: "입고완료", tone: "green" },
  on_hold: { label: "보류", tone: "amber" },
  rejected: { label: "반려", tone: "slate" },
};

function Info({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] text-slate-400">{k}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

const box = "rounded-lg border px-3 py-2.5 flex flex-col gap-1.5";
const boxTitle = "text-[11px] font-bold text-slate-500 tracking-wide";

export interface DetailActions {
  approve: () => void;
  decline: () => void;
  receive: () => void;
  share: () => void;
  reorder: () => void;
  revive: () => void;
  remove: () => void;
}

// 상세 화면: 요청 내용·사용목적·첨부 + 의견(요청자·승인자) + 진행 이력. 단계별 처리 버튼이 아래에 있다.
export default function PurchaseDetail({
  item,
  today,
  me,
  isApprover,
  canWrite,
  busy,
  onClose,
  onChanged,
  actions,
}: {
  item: PurchaseView;
  today: string;
  me: string;
  isApprover: boolean;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onChanged: (msg?: string) => void;
  actions: DetailActions;
}) {
  const [rows, setRows] = useState<PurchaseComment[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(() => toEdit(item));
  const [etaEdit, setEtaEdit] = useState({ eta: item.eta ?? "", amount: String(item.order_amount ?? ""), reason: "" });

  const mine = item.requested_by === me;
  const canEditRequest = canWrite && (item.status === "requested" || item.status === "on_hold") && (isApprover || mine);
  const canRemove =
    canWrite && (isApprover || (mine && (item.status === "requested" || item.status === "on_hold" || item.status === "rejected")));

  useEffect(() => {
    let cancelled = false;
    apiGet<PurchaseComment[]>(`/api/purchase/${item.id}/comments`)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [item.id, item.updated_at, reloadKey]);

  async function post() {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/purchase/${item.id}/comments`, { body, entered_by: me });
      setText("");
      setReloadKey((k) => k + 1);
      onChanged(isApprover ? "승인자 의견을 등록했습니다. 요청자 목록에도 바로 보입니다." : "의견을 등록했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeComment(id: number) {
    if (!confirm("이 의견을 삭제할까요?")) return;
    try {
      await apiDelete(`/api/purchase/${item.id}/comments/${id}`, { entered_by: me });
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveEdit() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/purchase/${item.id}`, { ...edit, urgent: edit.urgent ? "1" : "0", entered_by: me });
      setEditing(false);
      onChanged("요청 내용을 수정했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/purchase/${item.id}`, {
        eta: etaEdit.eta,
        order_amount: etaEdit.amount,
        reason: etaEdit.reason,
        entered_by: me,
      });
      setEtaEdit((v) => ({ ...v, reason: "" }));
      onChanged("발주 내용을 변경했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const comments = (rows ?? []).filter((r) => r.kind === "comment");
  const history = (rows ?? []).filter((r) => r.kind === "history");
  const st = STATUS[item.status];

  const footer = (
    <>
      {canRemove && (
        <button type="button" disabled={busy} onClick={actions.remove} className={`${btn} mr-auto text-slate-500`}>
          삭제
        </button>
      )}
      <button type="button" onClick={onClose} className={btn}>
        닫기
      </button>
      {item.status === "requested" && isApprover && (
        <>
          <button type="button" disabled={busy} onClick={actions.decline} className={btnRed}>
            반려·보류
          </button>
          <button type="button" disabled={busy} onClick={actions.approve} className={btnPrimary}>
            승인
          </button>
        </>
      )}
      {(item.status === "rejected" || item.status === "on_hold") && canWrite && (isApprover || mine) && (
        <button type="button" disabled={busy} onClick={actions.revive} className={btn}>
          다시 요청
        </button>
      )}
      {item.status === "ordered" && canWrite && (
        <button type="button" disabled={busy} onClick={actions.receive} className={btnPrimary}>
          입고확인
        </button>
      )}
      {item.status === "received" && canWrite && (
        <>
          <button type="button" disabled={busy} onClick={actions.reorder} className={btn}>
            재요청
          </button>
          <button type="button" disabled={busy} onClick={actions.share} className={btnKakao}>
            {item.kakao_shared_at ? "카톡 다시 공유" : "카톡 공유"}
          </button>
        </>
      )}
    </>
  );

  return (
    <Sheet
      onClose={onClose}
      footer={footer}
      title={
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-emerald-700">상세 · 의견</span>
          <h2 className="text-base font-bold text-slate-800 break-words">{item.part_name}</h2>
          <div className="flex flex-wrap gap-1">
            <Pill tone={st.tone}>{st.label}</Pill>
            <PurposePill p={item} />
            {!!item.urgent && <Pill tone="red">긴급</Pill>}
            {item.status === "requested" && <WaitPill p={item} today={today} />}
            {item.status === "ordered" && <EtaPill p={item} today={today} />}
            {item.status === "received" && (item.kakao_shared_at ? <Pill tone="green">카톡 공유됨</Pill> : <Pill tone="slate">카톡 미공유</Pill>)}
          </div>
        </div>
      }
    >
      {editing ? (
        <div className={`${box} bg-slate-50`}>
          <span className={boxTitle}>요청 내용 수정</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="col-span-2 sm:col-span-3 text-xs text-slate-600 flex flex-col gap-1">
              부품명
              <input value={edit.part_name} onChange={(e) => setEdit({ ...edit, part_name: e.target.value })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              수량
              <div className="flex gap-1">
                <input value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} className={inputCls} inputMode="decimal" />
                <select value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} className="border rounded-md px-1 text-sm bg-white">
                  {PURCHASE_UNITS.includes(edit.unit) ? null : <option>{edit.unit}</option>}
                  {PURCHASE_UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              예상 일정
              <input type="date" value={edit.expected_date} onChange={(e) => setEdit({ ...edit, expected_date: e.target.value })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              예산(원)
              <input value={edit.budget} onChange={(e) => setEdit({ ...edit, budget: e.target.value })} className={inputCls} inputMode="numeric" />
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              구입처
              <input value={edit.vendor} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">
              사용목적
              <select value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value as PurchasePurpose })} className={inputCls}>
                {PURCHASE_PURPOSES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600 flex items-center gap-1.5 self-end pb-1.5">
              <input type="checkbox" checked={edit.urgent} onChange={(e) => setEdit({ ...edit, urgent: e.target.checked })} />
              <span className="font-semibold text-red-700">긴급</span>
            </label>
            <label className="col-span-2 sm:col-span-3 text-xs text-slate-600 flex flex-col gap-1">
              사용처 · 목적 상세
              <input value={edit.purpose_detail} onChange={(e) => setEdit({ ...edit, purpose_detail: e.target.value })} className={inputCls} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={btn}>
              취소
            </button>
            <button type="button" disabled={saving} onClick={saveEdit} className={btnPrimary}>
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <Info k="수량">
              {fmtQty(item.qty)} {item.unit}
              {item.status === "ordered" && item.received_qty > 0 && (
                <span className="text-sky-700"> · 입고 {fmtQty(item.received_qty)}</span>
              )}
            </Info>
            <Info k="예산">{won(item.budget)}</Info>
            <Info k="구입처">{item.vendor || "미정"}</Info>
            <Info k="요청자 · 등록일">
              {item.requested_by} · {md(kstDate(item.created_at))}
            </Info>
            <Info k="예상 일정">{md(item.expected_date)}</Info>
            {item.order_date && (
              <>
                <Info k="발주일 · 승인자">
                  {md(item.order_date)} · {item.approved_by ?? "-"}
                </Info>
                <Info k="입고예정">{md(item.eta)}</Info>
                <Info k="발주금액">
                  {won(item.order_amount)} <BudgetDiff amount={item.order_amount} budget={item.budget} />
                </Info>
              </>
            )}
            {item.received_date && (
              <Info k="입고일 · 확인자">
                {md(item.received_date)} · {item.received_by ?? "-"}
              </Info>
            )}
          </div>
          <div className={box}>
            <div className="flex items-center justify-between">
              <span className={boxTitle}>사용처 · 목적 상세</span>
              {canEditRequest && (
                <button
                  type="button"
                  onClick={() => {
                    setEdit(toEdit(item));
                    setEditing(true);
                  }}
                  className="text-xs text-sky-700 hover:underline"
                >
                  요청 내용 수정
                </button>
              )}
            </div>
            <span className="text-sm whitespace-pre-wrap">{item.purpose_detail}</span>
          </div>
        </>
      )}

      {item.decline_reason && (item.status === "rejected" || item.status === "on_hold") && (
        <div className={`${box} bg-amber-50 border-amber-200`}>
          <span className={boxTitle}>{st.label} 사유</span>
          <span className="text-sm">
            {item.decline_reason} <span className="text-xs text-slate-500">· {item.declined_by}</span>
          </span>
        </div>
      )}

      {item.attachments.length > 0 && (
        <div className={box}>
          <span className={boxTitle}>첨부</span>
          <div className="flex flex-wrap gap-2">
            {item.attachments.map((a) => {
              const url = `/api/purchase/${item.id}/attachments/${a.id}`;
              return (
                <a key={a.id} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border rounded-md p-1 pr-2 text-xs hover:bg-slate-50 max-w-[220px]">
                  {a.mime_type?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <span className="w-10 h-10 rounded bg-red-50 text-red-700 flex items-center justify-center font-bold">PDF</span>
                  )}
                  <span className="truncate">
                    <span className="text-slate-400">{a.which === "delivery" ? "납품 " : "요청 "}</span>
                    {a.file_name}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {item.status === "ordered" && isApprover && (
        <div className={box}>
          <span className={boxTitle}>입고예정일 · 발주금액 변경 (관리자)</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="date" value={etaEdit.eta} onChange={(e) => setEtaEdit({ ...etaEdit, eta: e.target.value })} className={inputCls} aria-label="새 입고예정일" />
            <input value={etaEdit.amount} onChange={(e) => setEtaEdit({ ...etaEdit, amount: e.target.value })} className={inputCls} inputMode="numeric" aria-label="발주금액" placeholder="발주금액(원)" />
            <input value={etaEdit.reason} onChange={(e) => setEtaEdit({ ...etaEdit, reason: e.target.value })} className={inputCls} placeholder="일정 변경 사유 (예: 구입처 재고 부족)" aria-label="변경 사유" />
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={saving} onClick={saveOrder} className={btn}>
              변경 저장
            </button>
          </div>
        </div>
      )}

      <div className={box}>
        <span className={boxTitle}>의견 {comments.length}개</span>
        {rows === null ? (
          <span className="text-xs text-slate-400">불러오는 중...</span>
        ) : comments.length === 0 ? (
          <span className="text-xs text-slate-400">아직 의견이 없습니다. 요청자와 승인자가 여기서 의견을 주고받을 수 있습니다.</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {comments.map((c) => (
              <div key={c.id} className={`rounded-md px-2.5 py-1.5 text-sm ${c.role === "승인자" ? "bg-violet-50" : "bg-slate-50"}`}>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <b className={c.role === "승인자" ? "text-violet-700" : "text-slate-800"}>{c.author}</b>
                  {c.role && <Pill tone={c.role === "승인자" ? "violet" : "slate"}>{c.role}</Pill>}
                  <span className="tabular-nums">{fmtTs(c.created_at)}</span>
                  {canWrite && (c.author === me || isApprover) && (
                    <button type="button" onClick={() => removeComment(c.id)} className="ml-auto text-slate-400 hover:text-red-600">
                      삭제
                    </button>
                  )}
                </div>
                <div className="whitespace-pre-wrap break-words">{c.body}</div>
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <div className="flex flex-col sm:flex-row gap-1.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={isApprover ? "승인자 의견을 남겨 주세요 (예: 견적 1곳 더 받아 주세요)" : "추가 설명이나 답변을 남겨 주세요"}
              className={`${inputCls} flex-1`}
            />
            <button type="button" disabled={saving || !text.trim()} onClick={post} className="bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 whitespace-nowrap sm:self-end">
              {isApprover ? "승인자 의견 등록" : "의견 등록"}
            </button>
          </div>
        )}
      </div>

      <div className={box}>
        <span className={boxTitle}>진행 이력</span>
        <ul className="border-l-2 border-slate-200 pl-3 flex flex-col gap-1">
          {history.map((h) => (
            <li key={h.id} className="text-xs text-slate-500 relative before:content-[''] before:absolute before:-left-[17px] before:top-1.5 before:w-2 before:h-2 before:rounded-full before:bg-emerald-500">
              <b className="text-slate-700 tabular-nums">{fmtTs(h.created_at)}</b> · {h.body} · {h.author}
            </li>
          ))}
        </ul>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Sheet>
  );
}

function toEdit(p: PurchaseView) {
  return {
    part_name: p.part_name,
    qty: fmtQty(p.qty),
    unit: p.unit,
    expected_date: p.expected_date ?? "",
    budget: String(Math.round(p.budget)),
    vendor: p.vendor ?? "",
    purpose: p.purpose,
    purpose_detail: p.purpose_detail,
    urgent: !!p.urgent,
  };
}
