"use client";

import { useEffect } from "react";
import { shiftDate, today } from "@/lib/dateNav";

// 전날/다음날/오늘 이동 버튼 표준 부품. 날짜가 들어가는 모든 입력·조회 화면에서 공용으로 쓴다.
// 아무 입력칸에도 포커스가 없을 때는 좌우 화살표로도 전날/다음날 이동이 된다.
export default function DateNav({
  value,
  onChange,
  size = "sm",
}: {
  value: string;
  onChange: (date: string) => void;
  size?: "sm" | "md";
}) {
  const isToday = value === today();
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement !== document.body) return; // 다른 입력칸에 포커스가 있으면 무시
      if (e.key === "ArrowLeft") onChange(shiftDate(value, -1));
      else if (e.key === "ArrowRight") onChange(shiftDate(value, 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [value, onChange]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, -1))}
        className={`border rounded-md bg-white ${pad}`}
      >
        ◀ 전날
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border rounded-md ${pad}`}
      />
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, 1))}
        className={`border rounded-md bg-white ${pad}`}
      >
        다음날 ▶
      </button>
      <button
        type="button"
        onClick={() => onChange(today())}
        className={`rounded-md ${pad} ${
          isToday ? "border bg-white text-slate-500" : "border border-slate-900 bg-slate-900 text-white font-medium"
        }`}
      >
        오늘
      </button>
    </div>
  );
}
