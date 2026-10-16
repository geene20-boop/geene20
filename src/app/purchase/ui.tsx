"use client";

import { ReactNode } from "react";
import {
  PURCHASE_ETA_WARN_DAYS,
  PURCHASE_WAIT_WARN_DAYS,
  daysBetween,
  waitDays,
} from "@/lib/purchase";
import { PurchaseView } from "@/lib/types";

// [구매발주] 화면 곳곳에서 쓰는 작은 표시 요소와 공용 함수

export function won(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString("ko-KR")}원`;
}

export function man(n: number): string {
  return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
}

export function md(d: string | null | undefined): string {
  return d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : "-";
}

export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// DB 시각(UTC)을 "10/16 14:05" 형태의 한국 시간으로
export function fmtTs(ts: string): string {
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const pillBase = "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap";

export function Pill({ tone, children, title }: { tone: "red" | "amber" | "green" | "sky" | "violet" | "slate"; children: ReactNode; title?: string }) {
  const cls = {
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-600",
  }[tone];
  return (
    <span className={`${pillBase} ${cls}`} title={title}>
      {children}
    </span>
  );
}

export function PurposePill({ p }: { p: Pick<PurchaseView, "purpose"> }) {
  return <Pill tone="sky">{p.purpose}</Pill>;
}

export function EtaPill({ p, today }: { p: Pick<PurchaseView, "eta">; today: string }) {
  if (!p.eta || !today) return null;
  const n = daysBetween(today, p.eta);
  if (n < 0) return <Pill tone="red">지연 {-n}일</Pill>;
  if (n === 0) return <Pill tone="amber">오늘 입고</Pill>;
  if (n <= PURCHASE_ETA_WARN_DAYS) return <Pill tone="amber">D-{n}</Pill>;
  return <Pill tone="slate">D-{n}</Pill>;
}

export function WaitPill({ p, today }: { p: Pick<PurchaseView, "requested_at">; today: string }) {
  if (!today) return null;
  const n = waitDays(p, today);
  return (
    <Pill tone={n >= PURCHASE_WAIT_WARN_DAYS ? "amber" : "slate"} title="승인을 기다린 기간">
      {n === 0 ? "오늘" : `${n}일째`}
    </Pill>
  );
}

export function BudgetDiff({ amount, budget }: { amount: number | null; budget: number }) {
  if (amount == null) return null;
  const d = amount - budget;
  if (d > 0) return <Pill tone="red">+{won(d)} 초과</Pill>;
  if (d < 0) return <Pill tone="green">{won(-d)} 절감</Pill>;
  return <Pill tone="slate">예산 동일</Pill>;
}

export const btn = "text-xs font-semibold border rounded-md px-2 py-1 bg-white whitespace-nowrap disabled:opacity-40";
export const btnPrimary = "text-xs font-semibold rounded-md px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap disabled:opacity-40";
export const btnRed = `${btn} text-red-700 border-red-200 hover:bg-red-50`;
export const btnKakao = "text-xs font-semibold rounded-md px-2.5 py-1 bg-[#FEE500] text-[#191600] hover:brightness-95 whitespace-nowrap disabled:opacity-40";
export const inputCls = "border rounded-md px-2 py-1.5 text-sm bg-white w-full min-w-0";

// 업로드 전 브라우저에서 사진을 가로 1600px 이하 WebP로 줄인다 (PDF·작은 사진은 그대로).
export async function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function sendForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.reload();
    throw new Error("로그인이 만료되어 다시 로그인합니다.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || `요청이 실패했습니다. (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") msg = parsed.error;
    } catch {
      // JSON이 아니면 원문 그대로
    }
    throw new Error(msg);
  }
  return res.json();
}

// 화면 전체를 덮는 넓은 팝업 (상세 화면용)
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">{title}</div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto flex flex-col gap-3">{children}</div>
        {footer && <div className="border-t px-5 py-3 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
