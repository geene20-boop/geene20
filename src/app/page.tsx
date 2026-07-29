import Link from "next/link";
import { NAV_GROUPS } from "@/lib/navGroups";

export default function Home() {
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
                  className="text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md px-2 py-2"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
