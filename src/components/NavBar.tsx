"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import HanilLogo from "@/components/HanilLogo";
import { filterNavGroups, NAV_GROUPS, NavGroup } from "@/lib/navGroups";

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "입력가능",
  viewer: "조회전용",
};

async function logout() {
  if (!confirm("정말 로그아웃하시겠습니까?")) return;
  await fetch("/api/site/logout", { method: "POST" });
  window.location.reload();
}

function AccountBadge() {
  const session = useSiteSession();

  if (!session.loggedIn) return null;

  return (
    <div className="ml-auto hidden md:flex items-center gap-2 text-xs text-slate-500">
      <span>
        {session.displayName}
        {session.role && ` (${ROLE_LABELS[session.role] ?? session.role})`}
      </span>
      <button onClick={logout} className="underline">
        로그아웃
      </button>
    </div>
  );
}

function MobileAccountBadge() {
  const session = useSiteSession();

  if (!session.loggedIn) return null;

  return (
    <div className="flex items-center justify-between px-2 py-2.5 mb-1 border-b text-sm text-slate-600">
      <span>
        {session.displayName}
        {session.role && ` (${ROLE_LABELS[session.role] ?? session.role})`}
      </span>
      <button onClick={logout} className="underline text-slate-500">
        로그아웃
      </button>
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const session = useSiteSession();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  // 외국인 근로자와 연동된 계정은 근태관리를 이용하지 않으므로 메뉴에서 숨긴다.
  const baseGroups = session.isForeignWorker
    ? NAV_GROUPS.filter((g) => g.label !== "근태관리")
    : NAV_GROUPS;
  // 메뉴 그룹이 지정된 계정은 허용된 메뉴만 본다.
  const visibleGroups = filterNavGroups(baseGroups, session.allowedHrefs);

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
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-slate-800 whitespace-nowrap hover:opacity-80"
        >
          <HanilLogo className="h-7 w-auto shrink-0" />
          (주)한일씨앤에스 통합정보시스템
        </Link>

        <nav ref={navRef} className="hidden md:flex gap-1 relative">
          {visibleGroups.map((group) => {
            const active = isGroupActive(group, pathname);
            const open = openGroup === group.label;
            return (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.label)}
                  className={`px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {group.label} <span className="text-xs align-middle">▾</span>
                </button>
                {open && (
                  <div className="absolute left-0 top-full mt-1 bg-white border rounded-md shadow-lg py-1 min-w-[10rem] z-20">
                    {group.items.map((item) => {
                      const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-3 py-2 text-sm whitespace-nowrap ${
                            itemActive ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50"
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
          className="md:hidden ml-auto border rounded-md px-3 py-1.5 text-sm text-slate-600"
        >
          메뉴 ☰
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-30" onClick={() => setMobileOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white h-full w-72 max-w-[85vw] p-4 flex flex-col gap-1 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-800">메뉴</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-500 text-sm">
                닫기 ✕
              </button>
            </div>
            <MobileAccountBadge />
            {visibleGroups.map((group) => {
              const active = isGroupActive(group, pathname);
              const expanded = mobileExpanded === group.label || active;
              return (
                <div key={group.label} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setMobileExpanded(expanded ? null : group.label)}
                    className={`w-full flex items-center justify-between px-2 py-2.5 text-sm font-medium ${
                      active ? "text-slate-900" : "text-slate-600"
                    }`}
                  >
                    {group.label}
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
                              itemActive ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600"
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
