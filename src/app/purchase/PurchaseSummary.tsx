"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PurchaseDashboard, groupMonthAmount, monthlyOrderTotals } from "@/lib/purchase";
import { PurchaseView } from "@/lib/types";
import { man, won } from "./ui";

export type QuickFilter = "" | "urgent" | "old" | "late" | "partial" | "unshared";

const tile = "text-left rounded-xl border bg-white px-3 py-2.5 flex flex-col gap-0.5 border-t-4 hover:bg-slate-50 min-w-0";

// 상단 진행현황: 칸을 누르면 해당 단계 화면으로 이동하면서 그 조건으로 목록을 거른다.
export function PurchaseDashboardTiles({ d, active }: { d: PurchaseDashboard; active: QuickFilter }) {
  const rate = d.monthBudget > 0 ? Math.round((d.monthAmount / d.monthBudget) * 100) : 0;
  const pendingSub = [d.urgent ? `긴급 ${d.urgent}` : "", d.oldWaiting ? `3일+ 대기 ${d.oldWaiting}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Link href="/purchase/request" className={`${tile} border-t-amber-500`}>
        <span className="text-xs font-semibold text-slate-500">승인대기</span>
        <b className="text-2xl tabular-nums leading-tight text-amber-700">{d.pending}</b>
        <span className="text-[11px] text-slate-400 truncate">{pendingSub || "관리자 승인 필요"}</span>
      </Link>
      <Link href="/purchase/order" className={`${tile} border-t-sky-500`}>
        <span className="text-xs font-semibold text-slate-500">발주 진행</span>
        <b className="text-2xl tabular-nums leading-tight">{d.ordered}</b>
        <span className="text-[11px] text-slate-400">7일 내 입고예정 {d.dueSoon}건</span>
      </Link>
      <Link
        href={active === "late" ? "/purchase/order" : "/purchase/order?f=late"}
        className={`${tile} border-t-red-500 ${active === "late" ? "ring-2 ring-red-300" : ""}`}
      >
        <span className="text-xs font-semibold text-slate-500">입고 지연</span>
        <b className={`text-2xl tabular-nums leading-tight ${d.late > 0 ? "text-red-600" : ""}`}>{d.late}</b>
        <span className="text-[11px] text-slate-400">{d.late > 0 ? "예정일 지남, 확인 필요" : "지연 없음"}</span>
      </Link>
      <Link
        href={active === "unshared" ? "/purchase/receive" : d.unsharedThisMonth ? "/purchase/receive?f=unshared" : "/purchase/receive"}
        className={`${tile} border-t-emerald-500 ${active === "unshared" ? "ring-2 ring-emerald-300" : ""}`}
      >
        <span className="text-xs font-semibold text-slate-500">이번 달 입고</span>
        <b className="text-2xl tabular-nums leading-tight">{d.receivedThisMonth}</b>
        <span className="text-[11px] text-slate-400">{d.unsharedThisMonth ? `카톡 미공유 ${d.unsharedThisMonth}건` : "모두 카톡 공유됨"}</span>
      </Link>
      <div className={`${tile} border-t-emerald-500 col-span-2 md:col-span-1 hover:bg-white`}>
        <span className="text-xs font-semibold text-slate-500">이번 달 발주금액</span>
        <b className={`text-2xl tabular-nums leading-tight ${rate > 100 ? "text-red-600" : ""}`}>{rate}%</b>
        <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
          <div className={`h-full ${rate > 100 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {man(d.monthAmount)} / 예산 {man(d.monthBudget)}원
        </span>
      </div>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const top = rows[0]?.[1] ?? 1;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500">{title}</span>
      {rows.length === 0 ? (
        <span className="text-xs text-slate-400">이번 달 발주가 아직 없습니다.</span>
      ) : (
        rows.map(([k, v]) => (
          <div key={k} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">{k}</span>
              <span className="tabular-nums shrink-0">{won(v)}</span>
            </div>
            <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${(v / top) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// 화면 하단 집계: 최근 6개월 발주금액(월 예산선 포함) + 이번 달 사용목적별·구입처별 금액
export function PurchaseStats({ items, today, monthBudget, exportUrl }: { items: PurchaseView[]; today: string; monthBudget: number; exportUrl: string }) {
  const monthly = monthlyOrderTotals(items, today);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 bg-white rounded-xl border p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">월별 발주금액</h2>
          <span className="text-xs text-slate-400">최근 6개월 · 점선은 월 예산 {man(monthBudget)}원</span>
          <a href={exportUrl} className="ml-auto border border-slate-300 bg-white rounded-md px-3 py-1 text-xs font-medium hover:bg-slate-50">
            엑셀 내려받기
          </a>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
                width={52}
                domain={[0, (max: number) => Math.ceil((Math.max(max, monthBudget) * 1.1) / 1_000_000) * 1_000_000]}
              />
              <Tooltip formatter={(v) => won(Number(v))} labelFormatter={(l) => `${l} 발주금액`} cursor={{ fill: "#f1f5f9" }} />
              <ReferenceLine
                y={monthBudget}
                stroke="#d97706"
                strokeDasharray="4 4"
                label={{ value: "월 예산", position: "insideTopRight", fontSize: 11, fill: "#b45309" }}
              />
              <Bar dataKey="amount" name="발주금액" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {monthly.map((m, i) => (
                  <Cell
                    key={m.month}
                    fill={m.amount > monthBudget ? "#ef4444" : "#10b981"}
                    fillOpacity={i === monthly.length - 1 ? 1 : 0.55}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4 flex flex-col gap-4">
        <h2 className="text-sm font-bold">이번 달 발주 집계</h2>
        <Bars title="사용목적별" rows={groupMonthAmount(items, today, "purpose")} />
        <Bars title="구입처별" rows={groupMonthAmount(items, today, "vendor")} />
      </div>
    </div>
  );
}
