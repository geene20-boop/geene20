"use client";

import { PlanDashboard as Dashboard } from "@/lib/improvementPlan";

function man(n: number): string {
  // 만원 단위 요약 (예: 18,600,000 → 1,860만)
  return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
}

export type DashboardFilter = "" | "pending" | "overdue";

// 화면 상단 현황판: 처리할 일을 한눈에 보고, 칸을 누르면 그 상태로 목록을 거른다.
export default function PlanDashboard({
  d,
  active,
  onPick,
}: {
  d: Dashboard;
  active: DashboardFilter;
  onPick: (key: DashboardFilter | "review") => void;
}) {
  const rate = d.yearBudget > 0 ? Math.round((d.yearSpent / d.yearBudget) * 100) : 0;
  const tile = "text-left rounded-xl border bg-white px-3 py-2.5 flex flex-col gap-0.5 border-t-4 hover:bg-slate-50 min-w-0";
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <button type="button" onClick={() => onPick("")} className={`${tile} border-t-sky-500`}>
        <span className="text-xs font-semibold text-slate-500">진행중</span>
        <b className="text-2xl tabular-nums leading-tight">{d.inProgress}</b>
        <span className="text-[11px] text-slate-400">이번 달 마감 {d.dueThisMonth}건</span>
      </button>
      <button
        type="button"
        onClick={() => onPick(active === "pending" ? "" : "pending")}
        className={`${tile} border-t-amber-500 ${active === "pending" ? "ring-2 ring-amber-300" : ""}`}
      >
        <span className="text-xs font-semibold text-slate-500">승인대기</span>
        <b className="text-2xl tabular-nums leading-tight text-amber-700">{d.pending}</b>
        <span className="text-[11px] text-slate-400">관리자 승인 필요</span>
      </button>
      <button
        type="button"
        onClick={() => onPick(active === "overdue" ? "" : "overdue")}
        className={`${tile} border-t-red-500 ${active === "overdue" ? "ring-2 ring-red-300" : ""}`}
      >
        <span className="text-xs font-semibold text-slate-500">기한 초과</span>
        <b className={`text-2xl tabular-nums leading-tight ${d.overdue > 0 ? "text-red-600" : ""}`}>{d.overdue}</b>
        <span className="text-[11px] text-slate-400 truncate">
          {d.overdueNames.length > 0 ? d.overdueNames.slice(0, 2).join(", ") : "없음"}
        </span>
      </button>
      <button type="button" onClick={() => onPick("review")} className={`${tile} border-t-red-500`}>
        <span className="text-xs font-semibold text-slate-500">재검토</span>
        <b className={`text-2xl tabular-nums leading-tight ${d.review > 0 ? "text-red-600" : ""}`}>{d.review}</b>
        <span className="text-[11px] text-slate-400">완료 후 재검토 {d.reopened}건</span>
      </button>
      <div className={`${tile} border-t-emerald-500 col-span-2 md:col-span-1 hover:bg-white`}>
        <span className="text-xs font-semibold text-slate-500">올해 예산 집행</span>
        <b className={`text-2xl tabular-nums leading-tight ${rate > 100 ? "text-red-600" : ""}`}>{rate}%</b>
        <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
          <div
            className={`h-full ${rate > 100 ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-400 tabular-nums">
          집행 {man(d.yearSpent)} / 예산 {man(d.yearBudget)}원
        </span>
      </div>
    </div>
  );
}
