"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { NAV_GROUPS } from "@/lib/navGroups";
import { apiGet } from "@/lib/apiClient";
import { BoardPost, LeaveRequest, Nationality } from "@/lib/types";
import { BOARD_CATEGORY_STYLE } from "@/lib/boardCategory";
import { getBoardLastSeen } from "@/lib/boardRead";
import { getLeaveLastSeen } from "@/lib/leaveRead";
import { useSiteSession } from "@/lib/useSiteSession";
import Modal from "@/components/Modal";

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

// ---------- 홈화면 "전일현황" 요약 (생산·출하·재고·근태) ----------

interface CategoryTons {
  category: string;
  tons: number;
}
interface CategoryBagTonbag {
  category: string;
  bag: number;
  tonbag: number;
}
interface AttendancePerson {
  name: string;
  nationality: Nationality;
}
interface AttendanceLeaveEntry extends AttendancePerson {
  shift: "day" | "night";
  type: string;
}
interface HomeSummary {
  date: string;
  production: { total: number; byCategory: CategoryTons[] };
  shipment: { total: number; byCategory: CategoryTons[] };
  seasonProduction: CategoryBagTonbag[];
  seasonShipment: CategoryBagTonbag[];
  stock: { byCategory: CategoryBagTonbag[]; grandTotal: number };
  attendance: {
    day: { normal: AttendancePerson[] };
    night: { normal: AttendancePerson[] };
    leaveEtc: AttendanceLeaveEntry[];
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysLocal(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDateStr(dt);
}
function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
}
function fmtTon(n: number): string {
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const CATEGORY_DOT: Record<string, string> = {
  석회고토: "bg-amber-800",
  입상규산: "bg-emerald-700",
  칼슘유황: "bg-purple-700",
};

function NatBadge({ nationality }: { nationality: Nationality }) {
  return (
    <span
      className={`text-[10px] border rounded-full px-1.5 py-0.5 ml-1.5 ${
        nationality === "foreign"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-sky-50 text-sky-700 border-sky-200"
      }`}
    >
      {nationality === "foreign" ? "외국인" : "내국인"}
    </span>
  );
}

function SeasonTable({ rows }: { rows: CategoryBagTonbag[] }) {
  const grand = rows.reduce((s, r) => s + r.bag + r.tonbag, 0);
  return (
    <table className="w-full text-xs mt-2">
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.category}>
            <tr className="border-t">
              <td className="py-1.5 font-semibold text-slate-700 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[r.category] ?? "bg-slate-400"}`} />
                {r.category}
              </td>
              <td className="py-1.5 text-right font-semibold text-slate-700 tabular-nums">
                {fmtTon(r.bag + r.tonbag)}톤
              </td>
            </tr>
            <tr>
              <td className="py-1 pl-4 text-slate-500">포장지 제품</td>
              <td className="py-1 text-right text-slate-500 tabular-nums">{fmtTon(r.bag)}톤</td>
            </tr>
            {r.tonbag > 0 && (
              <tr>
                <td className="py-1 pl-4 text-slate-500">톤백 제품</td>
                <td className="py-1 text-right text-slate-500 tabular-nums">{fmtTon(r.tonbag)}톤</td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t bg-slate-50 font-bold text-slate-800">
          <td className="py-1.5 px-1">전체 합계</td>
          <td className="py-1.5 px-1 text-right tabular-nums">{fmtTon(grand)}톤</td>
        </tr>
      </tfoot>
    </table>
  );
}

function HomeStatusSection() {
  const [refDate, setRefDate] = useState<string | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<
    | { title: string; kind: "normal"; rows: AttendancePerson[] }
    | { title: string; kind: "leave"; rows: AttendanceLeaveEntry[] }
    | null
  >(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefDate(addDaysLocal(localDateStr(new Date()), -1));
  }, []);

  useEffect(() => {
    if (!refDate) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiGet<HomeSummary>(`/api/home-summary?date=${refDate}`)
      .then((d) => {
        if (!cancelled) setSummary(d);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refDate]);

  if (!refDate) return null;

  const todayStr = localDateStr(new Date());
  const isYesterday = refDate === addDaysLocal(todayStr, -1);
  const isToday = refDate === todayStr;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl border p-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRefDate((d) => addDaysLocal(d!, -1))}
          className="border rounded-md px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50"
        >
          ◀ 전날
        </button>
        <div className="flex-1 text-center text-sm font-semibold text-slate-800">
          {refDate} ({weekdayLabel(refDate)})
          {isYesterday && (
            <span className="ml-2 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
              기본값 · 전일
            </span>
          )}
          {isToday && (
            <span className="ml-2 text-[11px] font-medium text-slate-600 bg-slate-100 border rounded-full px-2 py-0.5">
              당일
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRefDate((d) => addDaysLocal(d!, 1))}
          disabled={isToday}
          className="border rounded-md px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          다음날 ▶
        </button>
      </div>

      {loading && !summary && <p className="text-sm text-slate-400 px-1">불러오는 중...</p>}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700">전일생산량</h2>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-bold text-slate-800 tabular-nums">
                  {fmtTon(summary.production.total)}
                </span>
                <span className="text-xs text-slate-400">톤</span>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {summary.production.byCategory.map((c) => (
                  <span
                    key={c.category}
                    className="text-[11px] border rounded-full px-2 py-0.5 bg-slate-50 text-slate-600"
                  >
                    {c.category} {fmtTon(c.tons)}톤
                  </span>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-slate-500">
                  품목별 시즌생산량 누계 <span className="text-slate-400 font-normal">(포장지/톤백 구분)</span>
                </p>
                <SeasonTable rows={summary.seasonProduction} />
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700">전일출하량</h2>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-bold text-slate-800 tabular-nums">
                  {fmtTon(summary.shipment.total)}
                </span>
                <span className="text-xs text-slate-400">톤</span>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {summary.shipment.byCategory.map((c) => (
                  <span
                    key={c.category}
                    className="text-[11px] border rounded-full px-2 py-0.5 bg-slate-50 text-slate-600"
                  >
                    {c.category} {fmtTon(c.tons)}톤
                  </span>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-slate-500">
                  품목별 시즌출하량 누계 <span className="text-slate-400 font-normal">(포장지/톤백 구분)</span>
                </p>
                <SeasonTable rows={summary.seasonShipment} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-slate-700">전일 재고현황</h2>
            <SeasonTable rows={summary.stock.byCategory} />
          </div>

          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">근태현황</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setDetail({ title: "주간조 · 정상출근", kind: "normal", rows: summary.attendance.day.normal })
                }
                className="flex items-center justify-between border rounded-lg px-3 py-2.5 bg-sky-50 border-sky-200 hover:bg-sky-100"
              >
                <span className="text-xs font-semibold text-sky-800">☀ 주간조 정상출근</span>
                <span className="text-sm font-bold text-sky-800 tabular-nums">
                  {summary.attendance.day.normal.length}명 ›
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setDetail({ title: "야간조 · 정상출근", kind: "normal", rows: summary.attendance.night.normal })
                }
                className="flex items-center justify-between border rounded-lg px-3 py-2.5 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
              >
                <span className="text-xs font-semibold text-indigo-800">🌙 야간조 정상출근</span>
                <span className="text-sm font-bold text-indigo-800 tabular-nums">
                  {summary.attendance.night.normal.length}명 ›
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setDetail({ title: "연차·기타 (주간+야간 통합)", kind: "leave", rows: summary.attendance.leaveEtc })
              }
              className="w-full flex items-center justify-between border rounded-lg px-3 py-2.5 bg-amber-50 border-amber-200 hover:bg-amber-100 mt-3"
            >
              <span className="text-xs font-semibold text-amber-800">연차·기타 (주간·야간 통합)</span>
              <span className="text-sm font-bold text-amber-800 tabular-nums">
                {summary.attendance.leaveEtc.length}명 ›
              </span>
            </button>
          </div>
        </>
      )}

      {detail && (
        <Modal title={detail.title} subtitle={`${refDate} 기준`} onClose={() => setDetail(null)}>
          <div className="flex flex-col gap-1.5">
            {detail.kind === "normal" &&
              detail.rows.map((p, i) => (
                <div key={i} className="flex items-center text-sm bg-slate-50 rounded-md px-3 py-2">
                  <span>{p.name}</span>
                  <NatBadge nationality={p.nationality} />
                </div>
              ))}
            {detail.kind === "leave" &&
              detail.rows.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
                  <span className="flex items-center">
                    {p.name}
                    <NatBadge nationality={p.nationality} />
                  </span>
                  <span className="text-xs text-slate-500 border rounded-full px-2 py-0.5 bg-white">
                    {p.shift === "day" ? "주간" : "야간"} · {p.type}
                  </span>
                </div>
              ))}
            {detail.rows.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">해당 인원이 없습니다.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Home() {
  const leaveUnread = useLeaveUnreadCount();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">메뉴</h1>
        <p className="text-sm text-slate-500 mt-1">이용할 메뉴를 선택하세요.</p>
      </div>
      <HomeStatusSection />
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
      <BoardPreview />
    </div>
  );
}
