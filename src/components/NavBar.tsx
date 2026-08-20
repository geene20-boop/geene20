"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { useAdminSession } from "@/components/AdminUnlock";
import HanilLogo from "@/components/HanilLogo";
import { isGroupBlockedForSession, NAV_GROUPS, NavGroup } from "@/lib/navGroups";
import { apiGet } from "@/lib/apiClient";
import { LeaveRequest } from "@/lib/types";

const COLLAPSE_KEY = "nav_sidebar_collapsed";

const GROUP_ICON: Record<string, string> = {
  "생산·품질": "🏭",
  제품포장: "📦",
  "원재료·문서": "🧾",
  근태: "👥",
  시스템: "⚙️",
};

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

function getStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function setStoredCollapsed(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    // localStorage 사용 불가(시크릿 모드 등)한 경우 조용히 무시
  }
}

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "입력가능",
  viewer: "조회전용",
};

// 관리자·수정권한 계정에게 "승인 대기" 건수를 사이드바에 상시 노출하기 위한 카운트.
// 근태관리 화면을 열지 않아도 대기 건이 있는지 바로 보여야 하므로 별도로 폴링한다.
function usePendingApprovalCount(canApprove: boolean, pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canApprove) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(0);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const rows = await apiGet<LeaveRequest[]>("/api/leave-request?status=pending");
        if (!cancelled) setCount(rows.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [canApprove, pathname]);

  return count;
}

function ApprovalBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="text-[11px] bg-red-500 text-white rounded-full px-1.5 leading-4 font-medium shrink-0">
      {count}
    </span>
  );
}

async function logout() {
  if (!confirm("정말 로그아웃하시겠습니까?")) return;
  await fetch("/api/site/logout", { method: "POST" });
  window.location.reload();
}

export default function NavBar() {
  const pathname = usePathname();
  const session = useSiteSession();
  const admin = useAdminSession();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    admin.refresh();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(getStoredCollapsed());
  }, []);

  const canApprove = session.isAdmin || session.isModifier;
  const pendingCount = usePendingApprovalCount(canApprove, pathname);
  // 외국인 근로자와 연동된 계정은 생산·품질/제품포장만 이용하므로 나머지는 메뉴에서 숨기고,
  // 지정된 개인 계정은 원재료·문서를 숨긴다. 관리자만 이력관리를 볼 수 있다.
  const visibleGroups = NAV_GROUPS.map((group) => {
    if (isGroupBlockedForSession(group.label, session.isForeignWorker, session.displayName, session.isAdmin)) {
      return null;
    }
    if (group.label === "시스템" && !session.isAdmin) {
      let items = group.items.filter((item) => item.href !== "/history");
      // 관리자 로그인이 아니면 데이터 가져오기도 숨긴다.
      if (!admin.loggedIn) {
        items = items.filter((item) => item.href !== "/import");
      }
      return { ...group, items };
    }
    return group;
  }).filter((g): g is typeof NAV_GROUPS[0] => g !== null);

  // 현재 페이지가 속한 그룹은 자동으로 펼쳐서 어디에 있는지 바로 보이게 한다.
  useEffect(() => {
    const active = visibleGroups.find((g) => isGroupActive(g, pathname));
    if (active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenGroup(active.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      setStoredCollapsed(next);
      return next;
    });
  }

  function openFromRail(label: string) {
    setCollapsed(false);
    setStoredCollapsed(false);
    setOpenGroup(label);
  }

  return (
    <>
      {/* 데스크톱: 좌측 접이식 메뉴 */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen bg-gradient-to-b from-[#0e1626] to-[#0b1220] border-r border-white/10 transition-[width] duration-150 ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        <div className={`flex items-center h-14 border-b border-white/10 shrink-0 ${collapsed ? "justify-center px-1" : "gap-2 px-3"}`}>
          <Link href="/" className="flex items-center gap-2 min-w-0 hover:opacity-80">
            <HanilLogo className="h-6 w-auto shrink-0" />
            {!collapsed && (
              <span className="text-xs font-semibold text-white leading-tight truncate">
                (주)한일씨앤에스
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-0.5">
          {visibleGroups.map((group) => {
            const active = isGroupActive(group, pathname);
            const open = !collapsed && openGroup === group.label;
            const showBadge = group.label === "근태";
            const icon = GROUP_ICON[group.label] ?? "•";

            if (collapsed) {
              return (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => openFromRail(group.label)}
                  title={group.label}
                  className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-md text-lg ${
                    active ? "bg-white/10" : "hover:bg-white/10"
                  }`}
                >
                  {icon}
                  {showBadge && pendingCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            }

            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.label)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors ${
                    active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span className="flex-1 text-left truncate">{group.label}</span>
                  {showBadge && <ApprovalBadge count={pendingCount} />}
                  <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                </button>
                {open && (
                  <div className="mt-0.5 mb-1 ml-3 pl-3 border-l border-white/10 flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap ${
                            itemActive
                              ? "bg-white/10 text-white font-medium"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 shrink-0">
          {!collapsed && session.loggedIn && (
            <div className="px-3 py-2.5 flex items-center gap-2 text-xs text-white/70 border-b border-white/10">
              <span className="w-[18px] h-[18px] rounded-full bg-[#3b62c9] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                {(session.displayName ?? "?").slice(0, 1)}
              </span>
              <span className="flex-1 truncate">
                {session.displayName}
                {session.role && ` (${ROLE_LABELS[session.role] ?? session.role})`}
              </span>
              <button onClick={logout} className="underline decoration-white/30 hover:text-white hover:decoration-white/70 shrink-0">
                로그아웃
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            className="w-full flex items-center justify-center gap-1.5 text-white/50 hover:text-white text-xs py-2"
          >
            {collapsed ? "»" : "« 접기"}
          </button>
        </div>
      </aside>

      {/* 모바일: 상단 바 + 좌측 드로어 */}
      <header className="md:hidden sticky top-0 z-10 bg-gradient-to-b from-[#0e1626] to-[#0b1220] border-b border-white/10">
        <div className="px-4 flex items-center gap-3 h-14">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white whitespace-nowrap hover:opacity-80">
            <HanilLogo className="h-7 w-auto shrink-0" />
            (주)한일씨앤에스 통합정보시스템
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden ml-auto border border-white/20 rounded-md px-3 py-1.5 text-sm text-white/80 flex items-center gap-1.5"
          >
            메뉴 ☰
            {canApprove && <ApprovalBadge count={pendingCount} />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-30" onClick={() => setMobileOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0b1220] h-full w-72 max-w-[85vw] p-4 flex flex-col gap-1 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">메뉴</span>
              <button onClick={() => setMobileOpen(false)} className="text-white/60 text-sm">
                닫기 ✕
              </button>
            </div>
            {visibleGroups.map((group) => {
              const active = isGroupActive(group, pathname);
              const expanded = mobileExpanded === group.label || active;
              const showBadge = group.label === "근태";
              return (
                <div key={group.label} className="border-b border-white/10 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setMobileExpanded(expanded ? null : group.label)}
                    className={`w-full flex items-center justify-between px-2 py-2.5 text-sm font-medium ${
                      active ? "text-white" : "text-white/60"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {GROUP_ICON[group.label] ?? ""} {group.label}
                      {showBadge && <ApprovalBadge count={pendingCount} />}
                    </span>
                    <span className="text-xs">{expanded ? "▲" : "▼"}</span>
                  </button>
                  {expanded && (
                    <div className="flex flex-col pb-2">
                      {group.items.map((item) => {
                        const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`px-4 py-2 rounded-md text-sm ${
                              itemActive ? "bg-white/10 text-white font-medium" : "text-white/60"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {session.loggedIn && (
              <div className="mt-2 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <span className="text-xs text-white/60">
                  {session.displayName}
                  {session.role && ` (${ROLE_LABELS[session.role] ?? session.role})`}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-sm text-white/80 border border-white/20 rounded-md px-3 py-1.5"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
