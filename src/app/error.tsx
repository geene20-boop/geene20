"use client";

import { useEffect } from "react";

// 페이지 렌더링 중 예상치 못한 오류가 나도 raw 오류 대신 안내 화면을 보여준다.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 로그(Railway Deploy Logs)에서 원인을 추적할 수 있도록 콘솔에 남김
    console.error("페이지 오류:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl">
        !
      </div>
      <h1 className="text-lg font-bold text-slate-800">화면을 불러오는 중 문제가 생겼습니다</h1>
      <p className="text-sm text-slate-500 max-w-md">
        일시적인 오류일 수 있습니다. 아래 &lsquo;다시 시도&rsquo;를 눌러주세요. 계속 반복되면
        관리자에게 이 화면을 캡처해 알려주세요.
      </p>
      <div className="flex gap-2 mt-2">
        <button
          onClick={reset}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium"
        >
          다시 시도
        </button>
        <a
          href="/dashboard"
          className="border border-slate-300 rounded-md px-4 py-2 text-sm text-slate-700"
        >
          홈으로
        </a>
      </div>
      {error.digest && (
        <p className="text-[11px] text-slate-400 mt-2">오류 코드: {error.digest}</p>
      )}
    </div>
  );
}
