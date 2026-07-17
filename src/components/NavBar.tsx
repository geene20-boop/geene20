"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "통합 대시보드" },
  { href: "/daily", label: "일자별 대시보드" },
  { href: "/monthly", label: "월간 시트" },
  { href: "/production", label: "생산일지 입력" },
  { href: "/qc", label: "QC측정 입력" },
  { href: "/import", label: "데이터 가져오기" },
  { href: "/admin", label: "관리자 설정" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-semibold text-slate-800 whitespace-nowrap">
          설비/품질 관리 시스템
        </span>
        <nav className="flex gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
