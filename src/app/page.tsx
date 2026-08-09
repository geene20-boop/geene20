"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "@/lib/navGroups";
import { apiGet } from "@/lib/apiClient";
import { BoardPost, LeaveRequest } from "@/lib/types";
import { BOARD_CATEGORY_STYLE } from "@/lib/boardCategory";
import { getBoardLastSeen } from "@/lib/boardRead";
import { getLeaveLastSeen } from "@/lib/leaveRead";
import { useSiteSession } from "@/lib/useSiteSession";

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

interface DailyLogRow {
  key: string;
  label: string;
  unit: string | null;
  packedQty: number;
  shippedQty: number;
  restockedQty: number;
}

interface DailyLogResult {
  products: DailyLogRow[];
  bagmats: DailyLogRow[];
  auxes: DailyLogRow[];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtQty(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function PrevDaySummary() {
  const [date] = useState(() => yesterday());
  const [data, setData] = useState<DailyLogResult | null>(null);

  useEffect(() => {
    apiGet<DailyLogResult>(`/api/packing-daily-log?date=${date}`)
      .then(setData)
      .catch(() => setData(null));
  }, [date]);

  const produced = (data?.products ?? []).filter((r) => r.packedQty !== 0);
  const shipped = (data?.products ?? []).filter((r) => r.shippedQty !== 0);
  const restocked = [...(data?.bagmats ?? []), ...(data?.auxes ?? [])].filter((r) => r.restockedQty !== 0);

  function renderList(rows: DailyLogRow[], qtyKey: "packedQty" | "shippedQty" | "restockedQty") {
    if (rows.length === 0) return <p className="text-sm text-slate-400 py-1">기록 없음</p>;
    return (
      <ul className="flex flex-col divide-y">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-slate-600">{r.label}</span>
            <span className="tabular-nums font-medium text-slate-800">
              {fmtQty(r[qtyKey])}
              {r.unit ?? ""}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          📅 전일현황 ({date})
        </h2>
        <Link href="/packing/log" className="text-xs text-slate-500 hover:underline">
          자세히 →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 mb-1">생산량</h3>
          {renderList(produced, "packedQty")}
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 mb-1">출하량</h3>
          {renderList(shipped, "shippedQty")}
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 mb-1">원재료 입고</h3>
          {renderList(restocked, "restockedQty")}
        </div>
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

export default function Home() {
  const leaveUnread = useLeaveUnreadCount();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">메뉴</h1>
        <p className="text-sm text-slate-500 mt-1">이용할 메뉴를 선택하세요.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">{group.label}</h2>
            <div className="flex flex-col">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md px-2 py-2 flex items-center gap-1.5"
                >
                  {item.label}
                  {item.href === "/attendance" && leaveUnread > 0 && (
                    <span className="text-[11px] bg-red-500 text-white rounded-full px-1.5 leading-4 font-medium">
                      {leaveUnread}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <PrevDaySummary />
      <BoardPreview />
    </div>
  );
}
