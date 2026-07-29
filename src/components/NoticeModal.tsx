"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiGet } from "@/lib/apiClient";
import { ProductionLog } from "@/lib/types";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";

const REMINDER_HOUR = 9; // 매일 이 시각부터 확정 여부 확인
const CHECK_INTERVAL_MS = 5 * 60_000;
const SHIFTS = ["주", "야"] as const;
const SEEN_VERSION_KEY = "hiis_last_seen_update_version";
const CONFIRM_SNOOZE_KEY = "hiis_confirm_snooze_date";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function NoticeModal() {
  const pathname = usePathname();
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [missingShifts, setMissingShifts] = useState<string[]>([]);
  const [confirmSnoozed, setConfirmSnoozed] = useState(false);
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [snoozeChecked, setSnoozeChecked] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [updateExpanded, setUpdateExpanded] = useState(false);

  const checkConfirm = useCallback(async () => {
    const now = new Date();
    if (now.getHours() < REMINDER_HOUR) {
      setMissingShifts([]);
      return;
    }
    const target = yesterday();
    try {
      const rows = await apiGet<ProductionLog[]>(`/api/production?from=${target}&to=${target}`);
      const notConfirmed = SHIFTS.filter((s) => {
        const row = rows.find((r) => r.shift === s);
        return !row || !row.locked;
      });
      setConfirmDate(target);
      setMissingShifts(notConfirmed);
      // 재확인 주기마다 "닫기"로 임시로 숨긴 상태는 초기화한다 ("오늘 하루 그만보기"는 별도로 유지됨)
      setConfirmClosed(false);
    } catch {
      // 조회 실패 시 조용히 무시 (다음 주기에 재시도)
    }
  }, []);

  function closeConfirmBlock() {
    if (snoozeChecked) {
      localStorage.setItem(CONFIRM_SNOOZE_KEY, today());
      setConfirmSnoozed(true);
    } else {
      setConfirmClosed(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkConfirm();
    const interval = setInterval(checkConfirm, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkConfirm);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkConfirm);
    };
  }, [checkConfirm]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdatePending(localStorage.getItem(SEEN_VERSION_KEY) !== CURRENT_VERSION);
    setConfirmSnoozed(localStorage.getItem(CONFIRM_SNOOZE_KEY) === today());
  }, []);

  function dismissUpdate() {
    localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
    setUpdatePending(false);
    setUpdateExpanded(false);
  }

  // 생산일지 화면에서는 확정 알림을 숨겨서, 실제로 확정 버튼을 누르러 온 사용자를 팝업이 가로막지 않게 한다.
  const showConfirmBlock =
    missingShifts.length > 0 &&
    confirmDate != null &&
    pathname !== "/production" &&
    !confirmSnoozed &&
    !confirmClosed;
  const showUpdateBlock = updatePending;

  if (!showConfirmBlock && !showUpdateBlock) return null;

  const latest = CHANGELOG[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="w-full max-w-[480px] bg-white rounded-2xl shadow-2xl overflow-hidden">
        {showConfirmBlock && (
          <div className="bg-amber-50 px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">⚠️</span>
              <div className="flex-1">
                <h2 className="text-lg font-extrabold text-amber-900 mb-1.5">생산일지 확정이 필요합니다</h2>
                <p className="text-[15px] text-slate-700">
                  <b className="text-slate-900">{confirmDate}</b> {missingShifts.join("/")}조가 아직 확정되지
                  않았습니다.
                </p>
                <div className="flex items-center gap-3 mt-3.5">
                  <a
                    href="/production"
                    className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg px-4 py-2.5"
                  >
                    확정하러 가기
                  </a>
                  <button
                    type="button"
                    onClick={closeConfirmBlock}
                    className="text-sm font-medium text-slate-500 hover:text-slate-700"
                  >
                    닫기
                  </button>
                </div>
                <label className="flex items-center gap-1.5 mt-3 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={snoozeChecked}
                    onChange={(e) => setSnoozeChecked(e.target.checked)}
                  />
                  오늘 하루 그만보기
                </label>
              </div>
            </div>
          </div>
        )}

        {showUpdateBlock && (
          <div className={`px-6 py-5 ${showConfirmBlock ? "border-t border-slate-100" : ""}`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">🆕</span>
              <div className="flex-1">
                <span className="inline-block text-[11px] font-extrabold tracking-wide uppercase text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-full mb-2">
                  업데이트 · {latest.date.slice(5).replace("-", "/")}
                </span>
                <h2 className="text-lg font-extrabold text-slate-900 mb-1.5">새로운 기능이 추가됐어요</h2>

                {!updateExpanded && (
                  <p className="text-[15px] text-slate-700">
                    {latest.items[0].title} 등 {latest.items.length}가지가 추가됐습니다.
                  </p>
                )}

                {updateExpanded && (
                  <div className="flex flex-col gap-3 mt-1 max-h-64 overflow-y-auto">
                    {latest.items.map((item) => (
                      <div key={item.title} className="flex gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
                        <div>
                          <b className="block text-[15px] text-slate-900">{item.title}</b>
                          <span className="text-[13.5px] text-slate-500">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2.5 mt-3.5">
                  {!updateExpanded && (
                    <button
                      type="button"
                      onClick={() => setUpdateExpanded(true)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg px-4 py-2.5"
                    >
                      세부보기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={dismissUpdate}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-lg px-4 py-2.5"
                  >
                    {updateExpanded ? "확인했습니다" : "확인"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
