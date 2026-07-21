"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "생산가동",
    items: [
      { href: "/production", label: "생산일지 입력" },
      { href: "/daily", label: "일자별 대시보드" },
      { href: "/monthly", label: "월간 시트" },
      { href: "/electricity", label: "전력사용량" },
      { href: "/utility", label: "월별 유틸리티" },
    ],
  },
  {
    label: "품질관리",
    items: [
      { href: "/qc", label: "QC측정 입력" },
      { href: "/dashboard", label: "통합 대시보드" },
    ],
  },
  {
    label: "제품포장",
    items: [
      { href: "/packing", label: "재고현황" },
      { href: "/packing/entry", label: "생산/출하 입력" },
      { href: "/packing/restock", label: "입고" },
      { href: "/packing/breakage", label: "파손" },
      { href: "/packing/return", label: "반품" },
      { href: "/packing/adjustment", label: "재고조정" },
      { href: "/packing/items", label: "품목관리" },
    ],
  },
  {
    label: "시스템관리",
    items: [
      { href: "/history", label: "이력 관리" },
      { href: "/import", label: "데이터 가져오기" },
      { href: "/admin", label: "관리자 설정" },
    ],
  },
];

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

export default function NavBar() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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
        <span className="font-semibold text-slate-800 whitespace-nowrap">설비/품질 관리 시스템</span>

        <nav ref={navRef} className="hidden md:flex gap-1 relative">
          {NAV_GROUPS.map((group) => {
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
            {NAV_GROUPS.map((group) => {
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
