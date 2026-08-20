"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { BoardPost, LeaveRequest, Nationality } from "@/lib/types";
import { BOARD_CATEGORY_STYLE } from "@/lib/boardCategory";
import { getBoardLastSeen } from "@/lib/boardRead";
import { getLeaveLastSeen } from "@/lib/leaveRead";
import { getPinnedMaterialKeys, togglePinnedMaterialKey } from "@/lib/inboundPins";
import { useSiteSession } from "@/lib/useSiteSession";
import Modal from "@/components/Modal";

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
  production: { tons: number; byCategory: CategoryTons[] };
  shipment: { tons: number; byCategory: CategoryTons[] };
  seasonProduction: CategoryBagTonbag[];
  seasonShipment: CategoryBagTonbag[];
  inbound: {
    tons: number;
    monthTons: number;
    top: { key: string; name: string; qty: number; monthQty: number }[];
  };
  stock: {
    byCategory: {
      category: string;
      bagCount: number;
      bagTons: number;
      tonbagCount: number;
      tonbagTons: number;
      tons: number;
    }[];
    totalTons: number;
  };
  attendance: {
    day: { normal: AttendancePerson[] };
    night: { normal: AttendancePerson[] };
    leaveEtc: AttendanceLeaveEntry[];
  };
  notices: { text: string; level: "red" | "amber"; link: string; linkLabel: string }[];
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

function Kpi({
  label,
  value,
  unit,
  alert,
  onClick,
}: {
  label: string;
  value: string;
  unit: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border p-5 text-left w-full ${
        alert ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
      } ${onClick ? "hover:border-slate-300 cursor-pointer" : ""}`}
    >
      <div className={`text-xs mb-2 ${alert ? "text-amber-800" : "text-slate-500"}`}>{label}</div>
      <div className={`text-2xl font-extrabold ${alert ? "text-amber-700" : "text-slate-900"}`}>
        {value}
        <span className={`text-sm font-semibold ml-1 ${alert ? "text-amber-600" : "text-slate-400"}`}>{unit}</span>
      </div>
    </Tag>
  );
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
  const w = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
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

function SeasonTable({ title, rows }: { title: string; rows: CategoryBagTonbag[] }) {
  const grand = rows.reduce((s, r) => s + r.bag + r.tonbag, 0);
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 mb-1.5">{title}</h3>
      <table className="w-full text-xs">
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
                <td className="py-1 pl-4 text-slate-500">포장지 {fmtTon(r.bag)}톤 · 톤백 {fmtTon(r.tonbag)}톤</td>
                <td />
              </tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-slate-50 font-bold text-slate-800">
            <td className="py-1.5 px-1">합계</td>
            <td className="py-1.5 px-1 text-right tabular-nums">{fmtTon(grand)}톤</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const leaveUnread = useLeaveUnreadCount();
  const [refDate, setRefDate] = useState<string | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [detail, setDetail] = useState<
    | { title: string; kind: "normal"; rows: AttendancePerson[] }
    | { title: string; kind: "leave"; rows: AttendanceLeaveEntry[] }
    | null
  >(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefDate(addDaysLocal(localDateStr(new Date()), -1));
    setPinnedKeys(getPinnedMaterialKeys());
  }, []);

  useEffect(() => {
    if (!refDate) return;
    let cancelled = false;
    const pinnedParam = pinnedKeys.length > 0 ? `&pinned=${pinnedKeys.join(",")}` : "";
    apiGet<HomeSummary>(`/api/dashboard/home-summary?date=${refDate}${pinnedParam}`)
      .then((d) => {
        if (!cancelled) setSummary(d);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refDate, pinnedKeys]);

  function togglePin(key: string) {
    setPinnedKeys(togglePinnedMaterialKey(key));
  }

  if (!refDate) return null;

  const todayStr = localDateStr(new Date());
  const isYesterday = refDate === addDaysLocal(todayStr, -1);
  const isToday = refDate === todayStr;

  const dayLeaveEtc = summary?.attendance.leaveEtc.filter((e) => e.shift === "day") ?? [];
  const nightLeaveEtc = summary?.attendance.leaveEtc.filter((e) => e.shift === "night") ?? [];
  const dayTotal = (summary?.attendance.day.normal.length ?? 0) + dayLeaveEtc.length;
  const nightTotal = (summary?.attendance.night.normal.length ?? 0) + nightLeaveEtc.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">전일 현황</h1>
        <p className="text-sm text-slate-500 mt-1">
          로고를 누르면 언제든 이 화면으로 돌아옵니다. 메뉴는 왼쪽(모바일은 상단 ☰)에서 이용하세요.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRefDate((d) => addDaysLocal(d!, -1))}
          className="border rounded-md px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50"
        >
          ◀ 전날
        </button>
        <div className="flex-1 text-center text-sm font-semibold text-slate-800">
          {weekdayLabel(refDate)} 기준
          {isYesterday && (
            <span className="ml-2 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
              기본값 · 전일
            </span>
          )}
          {isToday && (
            <span className="ml-2 text-[11px] font-medium text-slate-600 bg-slate-100 border rounded-full px-2 py-0.5">
              오늘
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDatePicker((v) => !v)}
            title="달력에서 날짜 선택"
            className={`border rounded-md w-8 h-8 flex items-center justify-center text-sm hover:bg-slate-50 ${
              showDatePicker ? "border-slate-400 bg-slate-50" : ""
            }`}
          >
            📅
          </button>
          {showDatePicker && (
            <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg p-2 z-20">
              <input
                type="date"
                value={refDate}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) setRefDate(e.target.value);
                  setShowDatePicker(false);
                }}
                className="border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRefDate((d) => addDaysLocal(d!, 1))}
          disabled={refDate >= todayStr}
          className="border rounded-md px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 disabled:opacity-40"
        >
          다음날 ▶
        </button>
      </div>

      <BoardPreview />

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="생산량" value={summary.production.tons.toFixed(1)} unit="t" />
            <Kpi label="출하량" value={summary.shipment.tons.toFixed(1)} unit="t" />
            <Kpi label="원재료 입고" value={summary.inbound.tons.toFixed(1)} unit="t" />
            <Kpi
              label="확인 필요"
              value={String(summary.notices.length)}
              unit="건"
              alert={summary.notices.length > 0}
              onClick={() => document.getElementById("home-notices")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">제품 재고현황 (품목대분류별, 현재)</h2>
              <div className="flex flex-col divide-y text-sm">
                {summary.stock.byCategory.map((c) => (
                  <Link
                    key={c.category}
                    href="/packing"
                    className="group flex flex-col py-1.5 -mx-2 px-2 rounded-md hover:bg-slate-50"
                  >
                    <div className="flex justify-between">
                      <span className="text-slate-600">{c.category}</span>
                      <span className="tabular-nums text-slate-800 font-semibold flex items-center gap-1">
                        {c.tons.toFixed(1)}t
                        <span className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          ›
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 pl-3 text-xs text-slate-500">
                      <span>포장지</span>
                      <span className="tabular-nums">
                        {c.bagCount.toLocaleString()}포 ({c.bagTons.toFixed(1)}t)
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 pl-3 text-xs text-slate-500">
                      <span>톤백</span>
                      <span className="tabular-nums">
                        {c.tonbagCount.toLocaleString()}개 ({c.tonbagTons.toFixed(1)}t)
                      </span>
                    </div>
                  </Link>
                ))}
                <div className="flex justify-between py-1.5 font-bold text-slate-900">
                  <span>전체 합계</span>
                  <span className="tabular-nums">
                    포장지 {summary.stock.byCategory.reduce((s, c) => s + c.bagTons, 0).toFixed(1)}t + 톤백{" "}
                    {summary.stock.byCategory.reduce((s, c) => s + c.tonbagTons, 0).toFixed(1)}t ={" "}
                    {summary.stock.totalTons.toFixed(1)}t
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">원재료 입고현황</h2>
              {summary.inbound.top.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">입고 기록이 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400">
                      <th className="text-center font-medium pb-1.5 w-6">★</th>
                      <th className="text-left font-medium pb-1.5">품목</th>
                      <th className="text-right font-medium pb-1.5">금일 입고</th>
                      <th className="text-right font-medium pb-1.5">{Number(refDate.slice(5, 7))}월 누계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...summary.inbound.top]
                      .sort((a, b) => Number(pinnedKeys.includes(b.key)) - Number(pinnedKeys.includes(a.key)))
                      .map((r) => {
                        const pinned = pinnedKeys.includes(r.key);
                        return (
                          <tr
                            key={r.key}
                            onClick={() => router.push("/raw-material/inbound-summary")}
                            className={`cursor-pointer hover:bg-slate-50 ${pinned ? "bg-amber-50/60" : ""}`}
                          >
                            <td className="py-1.5 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(r.key);
                                }}
                                title={pinned ? "고정 해제" : "즐겨찾기로 고정"}
                                className={pinned ? "text-amber-500" : "text-slate-300 hover:text-slate-400"}
                              >
                                {pinned ? "★" : "☆"}
                              </button>
                            </td>
                            <td className="py-1.5 text-slate-600">
                              {r.name}
                              {pinned && r.qty === 0 && (
                                <span className="ml-1.5 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                                  오늘 입고 없음
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-slate-800">
                              {r.qty === 0 ? "-" : r.qty.toLocaleString()}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-slate-500">
                              {r.monthQty.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-slate-900">
                      <td></td>
                      <td className="py-1.5">합계</td>
                      <td className="py-1.5 text-right tabular-nums">{summary.inbound.tons.toFixed(1)}t</td>
                      <td className="py-1.5 text-right tabular-nums">{summary.inbound.monthTons.toFixed(1)}t</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">시즌누계 (7월~다음해 6월)</h2>
              <div className="grid grid-cols-2 gap-4">
                <SeasonTable title="생산" rows={summary.seasonProduction} />
                <SeasonTable title="출하" rows={summary.seasonShipment} />
              </div>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">근태현황 (주간·야간)</h2>
              <div className="flex flex-col divide-y text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setDetail({ title: "주간조 정상출근", kind: "normal", rows: summary.attendance.day.normal })
                  }
                  className="flex justify-between py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-md text-left"
                >
                  <span className="text-slate-600">주간조 정상출근</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.day.normal.length}명 / {dayTotal}명
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetail({ title: "주간조 연차·기타", kind: "leave", rows: dayLeaveEtc })}
                  className="flex justify-between py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-md text-left"
                >
                  <span className="text-slate-600">주간조 연차·기타</span>
                  <span className="tabular-nums text-slate-800">{dayLeaveEtc.length}명</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDetail({ title: "야간조 정상출근", kind: "normal", rows: summary.attendance.night.normal })
                  }
                  className="flex justify-between py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-md text-left"
                >
                  <span className="text-slate-600">야간조 정상출근</span>
                  <span className="tabular-nums text-slate-800">
                    {summary.attendance.night.normal.length}명 / {nightTotal}명
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetail({ title: "야간조 연차·기타", kind: "leave", rows: nightLeaveEtc })}
                  className="flex justify-between py-1.5 hover:bg-slate-50 -mx-2 px-2 rounded-md text-left"
                >
                  <span className="text-slate-600">야간조 연차·기타</span>
                  <span className="tabular-nums text-slate-800">{nightLeaveEtc.length}명</span>
                </button>
                <div className="flex justify-between py-1.5 font-bold text-slate-900">
                  <span>전체 인원</span>
                  <span className="tabular-nums">{dayTotal + nightTotal}명</span>
                </div>
              </div>
            </div>

            <div id="home-notices" className="bg-white rounded-xl border p-5 lg:col-span-2 scroll-mt-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">알림</h2>
              <div className="flex flex-col divide-y text-sm">
                {leaveUnread > 0 && (
                  <Link href="/attendance" className="flex items-start gap-2 py-2 hover:bg-slate-50 -mx-2 px-2 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-500" />
                    <span className="text-slate-700 flex-1">내 연차 신청 결과 {leaveUnread}건이 처리되었습니다.</span>
                  </Link>
                )}
                {summary.notices.map((n, i) => (
                  <Link
                    key={i}
                    href={n.link}
                    className="flex items-start gap-2 py-2 hover:bg-slate-50 -mx-2 px-2 rounded-md"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        n.level === "red" ? "bg-red-500" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-slate-700 flex-1">{n.text}</span>
                    <span className="text-xs text-emerald-700 whitespace-nowrap">{n.linkLabel} ›</span>
                  </Link>
                ))}
                {summary.notices.length === 0 && leaveUnread === 0 && (
                  <p className="text-sm text-slate-400 py-2">확인할 알림이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          {detail.rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">해당 인원이 없습니다.</p>
          ) : (
            <div className="flex flex-col divide-y text-sm">
              {detail.kind === "normal"
                ? detail.rows.map((p, i) => (
                    <div key={i} className="flex items-center py-2">
                      <span className="text-slate-700">{p.name}</span>
                      <NatBadge nationality={p.nationality} />
                    </div>
                  ))
                : detail.rows.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <span className="flex items-center">
                        <span className="text-slate-700">{p.name}</span>
                        <NatBadge nationality={p.nationality} />
                      </span>
                      <span className="text-slate-500 text-xs">{p.type}</span>
                    </div>
                  ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
