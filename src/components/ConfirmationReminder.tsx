"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { ProductionLog } from "@/lib/types";

const REMINDER_HOUR = 9; // 매일 이 시각부터 확인
const CHECK_INTERVAL_MS = 60_000;
const SHIFTS = ["주", "야"] as const;

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function ConfirmationReminder() {
  const [dateStr, setDateStr] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const check = useCallback(async () => {
    const now = new Date();
    if (now.getHours() < REMINDER_HOUR) {
      setMissing([]);
      return;
    }
    const target = yesterday();
    try {
      const rows = await apiGet<ProductionLog[]>(`/api/production?from=${target}&to=${target}`);
      const notConfirmed = SHIFTS.filter((s) => {
        const row = rows.find((r) => r.shift === s);
        return !row || !row.locked;
      });
      setDateStr(target);
      setMissing(notConfirmed);
    } catch {
      // 조회 실패 시 조용히 무시 (다음 주기에 재시도)
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  if (missing.length === 0 || !dateStr) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] bg-white border border-amber-300 rounded-xl shadow-lg overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
        <span className="text-amber-600 text-lg leading-none">⚠️</span>
        <span className="text-sm font-semibold text-amber-800">생산일지 확정이 필요합니다</span>
      </div>
      <div className="px-4 py-3 text-sm text-slate-600 flex flex-col gap-3">
        <p>
          <b>{dateStr}</b> {missing.join("/")}조가 아직 확정되지 않았습니다.
        </p>
        <a
          href="/production"
          className="self-start bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-md px-3 py-1.5"
        >
          생산일지 확정하러 가기
        </a>
      </div>
    </div>
  );
}
