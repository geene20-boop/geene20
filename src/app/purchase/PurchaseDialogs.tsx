"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { apiPost, apiPut } from "@/lib/apiClient";
import { copyText, shareToKakao } from "@/lib/kakaoShare";
import { PURCHASE_DEFAULT_LEAD_DAYS, addDays, kakaoMessage, parseAmount } from "@/lib/purchase";
import { PurchaseView } from "@/lib/types";
import { BudgetDiff, PurposePill, btn, btnKakao, btnPrimary, btnRed, compressImage, fmtQty, inputCls, md, sendForm, won } from "./ui";

const label = "flex flex-col gap-1 text-xs text-slate-600";

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-xs text-red-600">{error}</p> : null;
}

// 승인 창 위쪽: 승인 판단에 필요한 사용목적·최근 의견 요약
function Summary({ p }: { p: PurchaseView }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <b>{p.part_name}</b>
        <PurposePill p={p} />
        {!!p.urgent && <span className="text-[11px] font-semibold text-red-700">긴급</span>}
      </div>
      <div className="text-slate-600">{p.purpose_detail}</div>
      <div className="text-xs text-slate-500">
        {fmtQty(p.qty)} {p.unit} · 예산 {won(p.budget)} · {p.vendor || "구입처 미정"} · 요청 {p.requested_by}
      </div>
      {p.last_admin_comment && <div className="text-xs text-violet-700">↳ 승인자: {p.last_admin_comment}</div>}
    </div>
  );
}

// 관리자 승인 → 발주. 한 건이면 발주금액·구입처를 고칠 수 있고, 여러 건이면 일괄 승인(금액 = 각 예산).
export function ApproveDialog({
  items,
  today,
  me,
  onClose,
  onDone,
}: {
  items: PurchaseView[];
  today: string;
  me: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const single = items.length === 1 ? items[0] : null;
  const [orderDate, setOrderDate] = useState(today);
  const [eta, setEta] = useState(addDays(today, PURCHASE_DEFAULT_LEAD_DAYS));
  const [amount, setAmount] = useState(single ? Math.round(single.budget).toLocaleString("ko-KR") : "");
  const [vendor, setVendor] = useState(single?.vendor ?? "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedAmount = parseAmount(amount);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/purchase/approve", {
        ids: items.map((i) => i.id),
        order_date: orderDate,
        eta,
        ...(single ? { order_amount: amount, vendor } : {}),
        comment,
        entered_by: me,
      });
      onDone(single ? `'${single.part_name}' 승인 완료 · 발주로 이동했습니다.` : `${items.length}건 일괄 승인 · 발주로 이동했습니다.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={single ? "관리자 승인" : `${items.length}건 일괄 승인`}
      subtitle={single ? undefined : "발주금액은 각 건의 예산으로 먼저 채워지며, 발주 화면에서 고칠 수 있습니다."}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {single ? (
          <Summary p={single} />
        ) : (
          <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm flex flex-col gap-1">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {i.part_name} <span className="text-xs text-sky-700">{i.purpose}</span>
                </span>
                <span className="tabular-nums shrink-0">{won(i.budget)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>합계</span>
              <span className="tabular-nums">{won(items.reduce((s, i) => s + i.budget, 0))}</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            발주일
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputCls} />
          </label>
          <label className={label}>
            입고 예상일
            <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} />
          </label>
        </div>
        {single && (
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              발주금액(원)
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </label>
            <label className={label}>
              구입처
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} />
            </label>
            <div className="col-span-2">
              {parsedAmount !== null && <BudgetDiff amount={parsedAmount} budget={single.budget} />}
            </div>
          </div>
        )}
        <label className={label}>
          승인자 의견 (선택) · 요청자에게 보입니다
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="예: 다음부터는 2개 업체 견적 비교 후 요청 바랍니다"
            className={inputCls}
          />
        </label>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btn}>
            취소
          </button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>
            {single ? "승인하고 발주로 이동" : `${items.length}건 승인`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 반려(진행 안 함) / 보류(나중에 다시 검토). 사유 = 승인자 의견, 필수.
export function DeclineDialog({
  item,
  me,
  onClose,
  onDone,
}: {
  item: PurchaseView;
  me: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [kind, setKind] = useState<"보류" | "반려">("보류");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) {
      setError("사유를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/api/purchase/${item.id}/decline`, { kind, reason, entered_by: me });
      onDone(`'${item.part_name}' ${kind} 처리 · 요청자에게 의견이 보입니다.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const choice = (k: "보류" | "반려", desc: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`flex-1 text-left rounded-lg border px-3 py-2 text-sm ${kind === k ? "border-slate-900 ring-1 ring-slate-900" : ""}`}
    >
      <b>{k}</b>
      <span className="block text-xs text-slate-500">{desc}</span>
    </button>
  );

  return (
    <Modal title="반려 · 보류" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Summary p={item} />
        <div className="flex gap-2">
          {choice("보류", "나중에 다시 검토")}
          {choice("반려", "진행하지 않음")}
        </div>
        <label className={label}>
          승인자 의견 · 사유 <span className="text-red-500">*</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="예: 다음 달로 보류, 견적 1곳 더 받아 주세요"
            className={inputCls}
          />
        </label>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btn}>
            취소
          </button>
          <button type="button" onClick={submit} disabled={busy} className={btnRed}>
            {kind} 처리
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 입고확인: 받은 수량이 남은 수량보다 적으면 부분입고로 남는다. 다 받으면 입고완료 → 카톡 공유 창으로 이어진다.
export function ReceiveDialog({
  item,
  today,
  me,
  onClose,
  onDone,
}: {
  item: PurchaseView;
  today: string;
  me: string;
  onClose: () => void;
  onDone: (updated: PurchaseView) => void;
}) {
  const left = item.qty - item.received_qty;
  const [qty, setQty] = useState(fmtQty(left));
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = Number(qty);
  const partial = Number.isFinite(q) && q > 0 && q < left;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("received_qty", qty);
      fd.set("received_date", date);
      fd.set("memo", memo);
      fd.set("entered_by", me);
      for (const f of photos) fd.append("photo", await compressImage(f));
      onDone(await sendForm<PurchaseView>(`/api/purchase/${item.id}/receive`, fd));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="입고확인"
      subtitle={`${item.part_name} · 발주 ${fmtQty(item.qty)} ${item.unit} · 이미 입고 ${fmtQty(item.received_qty)} · 남은 수량 ${fmtQty(left)}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            입고일
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className={label}>
            이번에 받은 수량 ({item.unit})
            <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className={label}>
          📎 납품 사진 (선택)
          <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} className="text-xs" />
        </label>
        <label className={label}>
          입고 메모 (선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} placeholder="예: 포장 일부 파손, 수량 이상 없음" className={inputCls} />
        </label>
        <p className="text-xs text-slate-500">
          {partial
            ? `부분입고 ${fmtQty(item.received_qty + q)}/${fmtQty(item.qty)}로 기록되고 발주 목록에 남습니다.`
            : "남은 수량을 모두 받으면 입고완료 처리되고, 생산부장님께 카톡으로 공유할 수 있습니다."}
        </p>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btn}>
            취소
          </button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>
            입고확인
          </button>
        </div>
      </div>
    </Modal>
  );
}

// 입고완료 안내 + 생산부장 카톡 공유
export function ShareDialog({
  item,
  me,
  fresh,
  onClose,
  onShared,
}: {
  item: PurchaseView;
  me: string;
  fresh: boolean; // 방금 입고확인한 건이면 '입고완료' 안내를 크게 보여준다
  onClose: () => void;
  onShared: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false); // 문구만 복사한 경우: 실제로 보냈는지는 직접 표시
  const text = kakaoMessage(item);
  const link = typeof window !== "undefined" ? `${window.location.origin}/purchase/receive` : "";

  async function markShared(msg: string) {
    try {
      await apiPut(`/api/purchase/${item.id}/shared`, { entered_by: me });
      onShared(msg);
    } catch (e) {
      setNote((e as Error).message);
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setNote(null);
    const r = await shareToKakao(text, link);
    if (r === "kakao" || r === "share") return markShared("카톡 공유를 기록했습니다.");
    setBusy(false);
    if (r === "copied") {
      setCopied(true);
      setNote("이 기기에서는 카톡 공유 창을 열 수 없어 문구를 복사했습니다. 카톡에서 생산부장님께 붙여 넣어 보낸 뒤 [보냄으로 표시]를 눌러 주세요.");
    }
    if (r === "failed") setNote("이 기기에서는 공유 창을 열 수 없습니다. 아래 문구를 길게 눌러 복사해 주세요.");
  }

  async function copy() {
    if (await copyText(`${text}\n\n${link}`)) {
      setCopied(true);
      setNote("문구를 복사했습니다. 카톡에 붙여 넣어 보낸 뒤 [보냄으로 표시]를 눌러 주세요.");
    } else setNote("복사가 막혀 있습니다. 아래 문구를 길게 눌러 복사해 주세요.");
  }

  return (
    <Modal title={fresh ? "✅ 입고완료" : "카톡으로 공유"} subtitle={`${item.part_name} · ${md(item.received_date)} 입고`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-[#b2c7d9] p-3">
          <div className="text-[11px] text-slate-700 mb-1">생산부장님께 보낼 메시지</div>
          <div className="bg-white rounded-lg overflow-hidden max-w-xs">
            <div className="bg-[#FEE500] text-[#191600] text-xs font-bold px-3 py-1.5">구매발주 알림</div>
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed px-3 py-2 select-all">{text}</pre>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          [카카오톡으로 공유]를 누르면 카톡(또는 휴대폰 공유 목록)이 열립니다. 대화 상대에서 <b>생산부장</b>을 골라 보내 주세요.
        </p>
        {note && <p className="text-xs text-sky-700">{note}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={btn}>
            나중에
          </button>
          <button type="button" onClick={copy} className={btn}>
            문구 복사
          </button>
          {copied && (
            <button type="button" onClick={() => markShared("카톡 공유를 기록했습니다.")} className={btn}>
              보냄으로 표시
            </button>
          )}
          <button type="button" onClick={share} disabled={busy} className={btnKakao}>
            카카오톡으로 공유
          </button>
        </div>
      </div>
    </Modal>
  );
}
