"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { useAdminSession } from "@/components/AdminUnlock";
import HanilLogo from "@/components/HanilLogo";
import { NAV_GROUPS, NavGroup } from "@/lib/navGroups";
import { apiGet } from "@/lib/apiClient";
import { LeaveRequest } from "@/lib/types";

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "입력가능",
  viewer: "조회전용",
};

// 관리자·수정권한 계정에게 "승인 대기" 건수를 상단바에 상시 노출하기 위한 카운트.
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

function AccountBadge() {
  const session = useSiteSession();

  async function logout() {
    if (!confirm("정말 로그아웃하시겠습니까?")) return;
    await fetch("/api/site/logout", { method: "POST" });
    window.location.reload();
  }

  if (!session.loggedIn) return null;

  const initial = (session.displayName ?? "?").slice(0, 1);

  return (
    <div className="ml-auto hidden md:flex items-center gap-2.5 text-xs text-white/70">
      <span className="w-[18px] h-[18px] rounded-full bg-[#3b62c9] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
        {initial}
      </span>
      <span>
        {session.displayName}
        {session.role && ` (${ROLE_LABELS[session.role] ?? session.role})`}
      </span>
      <button onClick={logout} className="underline decoration-white/30 hover:text-white hover:decoration-white/70">
        로그아웃
      </button>
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const session = useSiteSession();
  const admin = useAdminSession();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    admin.refresh();
  }, []);

  const canApprove = session.isAdmin || session.isModifier;
  const pendingCount = usePendingApprovalCount(canApprove, pathname);
  // 외국인 근로자와 연동된 계정은 근태관리를 이용하지 않으므로 메뉴에서 숨긴다.
  // 관리자만 이력관리를 볼 수 있다.
  const visibleGroups = NAV_GROUPS.map((group) => {
    if (group.label === "시스템관리" && !session.isAdmin) {
      let items = group.items.filter((item) => item.href !== "/history");
      // 관리자 로그인이 아니면 데이터 가져오기도 숨긴다.
      if (!admin.loggedIn) {
        items = items.filter((item) => item.href !== "/import");
      }
      return { ...group, items };
    }
    if (session.isForeignWorker && group.label === "근태관리") {
      return null;
    }
    return group;
  }).filter((g): g is typeof NAV_GROUPS[0] => g !== null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-gradient-to-b from-[#0e1626] to-[#0b1220] border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-white whitespace-nowrap hover:opacity-80"
        >
          <HanilLogo className="h-7 w-auto shrink-0" />
          (주)한일씨앤에스 통합정보시스템
        </Link>

        <nav ref={navRef} className="hidden md:flex gap-1 relative">
          {visibleGroups.map((group) => {
            const active = isGroupActive(group, pathname);
            const open = openGroup === group.label;
            const showBadge = group.label === "근태관리";
            return (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.label)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {group.label} <span className="text-xs align-middle">▾</span>
                  {showBadge && <ApprovalBadge count={pendingCount} />}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-2.5 right-2.5 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#4f7cd6] to-[#e2001a]"
                    />
                  )}
                </button>
                {open && (
                  <div className="absolute left-0 top-full mt-1 bg-[#0f1728] border border-white/10 rounded-md shadow-xl shadow-black/30 py-1 min-w-[10rem] z-20">
                    {group.items.map((item) => {
                      const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-3 py-2 text-sm whitespace-nowrap ${
                            itemActive ? "bg-white/10 text-white font-medium" : "text-white/60 hover:bg-white/5 hover:text-white"
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

        <AccountBadge />

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="md:hidden ml-auto border border-white/20 rounded-md px-3 py-1.5 text-sm text-white/80 flex items-center gap-1.5"
        >
          메뉴 ☰
          {canApprove && <ApprovalBadge count={pendingCount} />}
        </button>
      </div>

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
              const showBadge = group.label === "근태관리";
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
                      {group.label}
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
          </div>
        </div>
      )}
    </header>
  );
}
