"use client";

import { useEffect, useState } from "react";

// 등록/저장 버튼 옆에 붙어 헷갈리던 "맨 위로" 버튼을 화면 우하단에 항상 떠 있는
// 별도 버튼으로 분리한 공통 컴포넌트. 전 화면에 layout.tsx에서 한 번만 마운트한다.
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-40 bg-slate-900 text-white rounded-full w-12 h-12 shadow-lg text-sm font-medium hover:bg-slate-800"
      aria-label="맨 위로"
    >
      ↑
    </button>
  );
}
