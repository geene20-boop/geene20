"use client";

import { useEffect } from "react";
import { ImprovementPlanPhoto } from "@/lib/types";

// 사진 크게 보기: 화면 전체에 사진을 띄우고, 여러 장이면 ◀ ▶(또는 키보드 좌우)로 넘긴다.
// 배경을 누르거나 Esc를 누르면 닫힌다.
export default function PhotoLightbox({
  planId,
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  planId: number;
  photos: ImprovementPlanPhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const sideList = photos.filter((p) => p.which === photo?.which);
  const sideIdx = sideList.findIndex((p) => p.id === photo?.id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-label="사진 크게 보기"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/improvement-plan/${planId}/photos/${photo.id}`}
        alt={photo.which === "before" ? "개선 전" : "개선 후"}
        className="max-w-full max-h-[82vh] object-contain rounded-lg"
      />
      <div className="mt-3 flex items-center gap-4 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
          className="w-9 h-9 rounded-full bg-white/15 disabled:opacity-30"
          aria-label="이전 사진"
        >
          ◀
        </button>
        <span className="font-semibold">
          {photo.which === "before" ? "개선 전" : "개선 후"} {sideIdx + 1}/{sideList.length}
        </span>
        <button
          type="button"
          disabled={index === photos.length - 1}
          onClick={() => onIndexChange(index + 1)}
          className="w-9 h-9 rounded-full bg-white/15 disabled:opacity-30"
          aria-label="다음 사진"
        >
          ▶
        </button>
        <button type="button" onClick={onClose} className="ml-2 px-3 h-9 rounded-full bg-white/15">
          닫기 ✕
        </button>
      </div>
    </div>
  );
}
