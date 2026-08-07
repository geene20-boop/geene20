"use client";

// Build version: 0.1.2 - Version check marker
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { BoardPost, LeaveRequest } from "@/lib/types";
import { BOARD_CATEGORY_STYLE } from "@/lib/boardCategory";
import { getBoardLastSeen } from "@/lib/boardRead";
import { getLeaveLastSeen } from "@/lib/leaveRead";
import { useSiteSession } from "@/lib/useSiteSession";

interface HomeSummary {
  date: string;
  production: { tons: number };
  shipment: { tons: number };
  inbound: { tons: number; top: { name: string; qty: number }[] };
  stock: { byCategory: { category: string; bags: number; tons: number }[]; totalTons: number };
  attendance: {
    day: { normal: number; leave: number; other: number; total: number };
    night: { normal: number; leave: number; other: number; total: number };
  };
  notices: { text: string; level: "red" | "amber" }[];
}

function BoardPreview() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [lastSeen] = useState<string | null>(() => getBoardLastSeen());

  useEffect(() => {
    apiGet<BoardPost[]>("/api/board")
      .then((rows) => setPosts(rows.slice(0, 5)))
      .catch(() => setPosts([]));
  }, []);

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          📌 게시판 최근글
        </h2>
        <Link href="/board" className="text-xs text-slate-500 hover:underline">
          전체보기 →
        </Link>
      </div>
      <div className="flex flex-col divide-y">
        {posts.map((p) => {
          const isNew = lastSeen == null || p.created_at > lastSeen;
          return (
            <Link
              key={p.id}
              href={`/board/${p.id}`}
              className="flex items-center gap-2 py-2 text-sm hover:bg-slate-50 rounded-md px-2 -mx-2"
            >
              {isNew && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-label="안읽음" />}
              <span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${BOARD_CATEGORY_STYLE[p.category]}`}>
                {p.category}
              </span>
              <span className="flex-1 truncate">{p.title}</span>
              <span className="text-xs text-slate-400 shrink-0">{p.created_at.slice(0, 10)}</span>
            </Link>
          );
        })}
        {posts.length === 0 && <p className="text-sm text-slate-400 py-2">등록된 게시글이 없습니다.</p>}
      </div>
    </div>
  );
}

function useLeaveUnreadCount(): number {
  const session = useSiteSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session.checked || session.isAdmin || session.workerId == null) return;
    const lastSeen = getLeaveLastSeen();
    apiGet<LeaveRequest[]>("/api/leave-request")
      .then((rows) => {
        const n = rows.filter(
          (r) => r.status !== "pending" && r.decided_at && (lastSeen == null || r.decided_at > lastSeen)
        ).length;
        setCount(n);
      })
      .catch(() => setCount(0));
  }, [session.checked, session.isAdmin, session.workerId]);

  return count;
}

function Kpi({ label, value, unit, alert }: { label: string; value: string; unit: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${alert ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
      <div className={`text-xs mb-2 ${alert ? "text-amber-800" : "text-slate-500"}`}>{label}</div>
      <div className={`text-2xl font-extrabold ${alert ? "text-amber-700" : "text-slate-900"}`}>
        {value}
        <span className={`text-sm font-semibold ml-1 ${alert ? "text-amber-600" : "text-slate-400"}`}>{unit}</span>
      </div>
    </div>
  );
}

function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  const [y, m, day] = dateStr.split("-");
  return `${y}년 ${Number(m)}월 ${Number(day)}일 (${w}) 기준`;
}

export default function Home() {
  const leaveUnread = useLeaveUnreadCount();
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    apiGet<HomeSummary>("/api/dashboard/home-summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">전일 현황</h1>
        <p className="text-sm text-slate-500 mt-1">
          {summary ? weekdayLabel(summary.date) : "불러오는 중..."} — 로고를 누르면 언제든 이 화면으로 돌아옵니다.
          메뉴는 상단 드롭다운에서 이용하세요.
        </p>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="전일 생산량" value={summary.production.tons.toFixed(1)} unit="t" />
            <Kpi label="전일 출하량" value={summary.shipment.tons.toFixed(1)} unit="t" />
            <Kpi label="전일 원재료 입고" value={summary.inbound.tons.toFixed(1)} unit="t" />
            <Kpi
              label="확인 필요"
              value={String(summary.notices.length)}
              unit="건"
              alert={summary.notices.length > 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">제품 재고현황 (품목대분류별, 현재)</h2>
              <div className="flex flex-col divide-y text-sm">
                {summary.stock.byCategory.map((c) => (
                  <div key={c.category} className="flex justify-between py-1.5">
                    <span className="text-slate-600">{c.category}</span>
                    <span className="tabular-nums text-slate-800">
                      {c.bags.toLocaleString()}포 ({c.tons.toFixed(1)}t)
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-1.5 font-bold text-slate-900">
                  <span>전체 합계</span>
                  <span className="tabular-nums">{summary.stock.totalTons.toFixed(1)}t</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">원재료 입고현황 (전일)</h2>
              <div className="flex flex-col divide-y text-sm">
                {summary.inbound.top.map((r) => (
                  <div key={r.name} className="flex justify-between py-1.5">
                    <span className="text-slate-600">{r.name}</span>
                    <span className="tabular-nums text-slate-800">{r.qty.toLocaleString()}</span>
                  </div>
                ))}
                {summary.inbound.top.length === 0 && <p className="text-sm text-slate-400 py-2">전일 입고 기록이 없습니다.</p>}
                {summary.inbound.top.length > 0 && (
                  <div className="flex justify-between py-1.5 font-bold text-slate-900">
                    <span>합계</span>
                    <span className="tabular-nums">{summary.inbound.tons.toFixed(1)}t</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">근태현황 (전일, 주간·야간)</h2>
              <div className="flex flex-col divide-y text-sm">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">주간조 정상출근</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.day.normal}명 / {summary.attendance.day.total}명
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">주간조 연차·기타</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.day.leave + summary.attendance.day.other}명
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">야간조 정상출근</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.night.normal}명 / {summary.attendance.night.total}명
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">야간조 연차·기타</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.night.leave + summary.attendance.night.other}명
                  </span>
                </div>
                <div className="flex justify-between py-1.5 font-bold text-slate-900">
                  <span>전체 인원</span>
                  <span className="tabular-nums">
                    {summary.attendance.day.total + summary.attendance.night.total}명
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">알림</h2>
              <div className="flex flex-col divide-y text-sm">
                {leaveUnread > 0 && (
                  <Link href="/attendance" className="flex items-start gap-2 py-2 hover:bg-slate-50 -mx-2 px-2 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-500" />
                    <span className="text-slate-700">내 연차 신청 결과 {leaveUnread}건이 처리되었습니다.</span>
                  </Link>
                )}
                {summary.notices.map((n, i) => (
                  <div key={i} className="flex items-start gap-2 py-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        n.level === "red" ? "bg-red-500" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-slate-700">{n.text}</span>
                  </div>
                ))}
                {summary.notices.length === 0 && leaveUnread === 0 && (
                  <p className="text-sm text-slate-400 py-2">확인할 알림이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <BoardPreview />
    </div>
  );
}
