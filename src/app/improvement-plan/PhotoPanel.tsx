"use client";

import { useRef } from "react";
import { ImprovementPlanPhoto } from "@/lib/types";
import { IMPROVEMENT_PLAN_MAX_PHOTOS } from "@/lib/improvementPlan";

type Which = "before" | "after";

// 상세 팝업의 개선 전/후 사진 영역.
// - 지금 선택된 칸은 노란 테두리 + "● 개선 전" 굵은 글씨로 표시
// - 큰 사진을 누르면 크게 보기, 아래 작은 사진을 누르면 그 사진으로 바꿔 보기
// - 칸 이름 옆 "사진+" 버튼으로 바로 사진 추가 (각각 최대 3장)
export default function PhotoPanel({
  planId,
  photos,
  selected,
  onSelect,
  onOpen,
  canEdit,
  busy,
  onUpload,
  onDelete,
}: {
  planId: number;
  photos: ImprovementPlanPhoto[];
  selected: { which: Which; id: number | null };
  onSelect: (which: Which, id: number | null) => void;
  onOpen: (photoId: number) => void;
  canEdit: boolean;
  busy: boolean;
  onUpload: (which: Which, file: File) => void;
  onDelete: (photoId: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5">
      {(["before", "after"] as const).map((which) => (
        <Side
          key={which}
          which={which}
          planId={planId}
          photos={photos.filter((p) => p.which === which)}
          active={selected.which === which}
          activeId={selected.which === which ? selected.id : null}
          onSelect={onSelect}
          onOpen={onOpen}
          canEdit={canEdit}
          busy={busy}
          onUpload={onUpload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function Side({
  which,
  planId,
  photos,
  active,
  activeId,
  onSelect,
  onOpen,
  canEdit,
  busy,
  onUpload,
  onDelete,
}: {
  which: Which;
  planId: number;
  photos: ImprovementPlanPhoto[];
  active: boolean;
  activeId: number | null;
  onSelect: (which: Which, id: number | null) => void;
  onOpen: (photoId: number) => void;
  canEdit: boolean;
  busy: boolean;
  onUpload: (which: Which, file: File) => void;
  onDelete: (photoId: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = which === "before" ? "개선 전" : "개선 후";
  const shown = photos.find((p) => p.id === activeId) ?? photos[0] ?? null;
  const full = photos.length >= IMPROVEMENT_PLAN_MAX_PHOTOS;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {shown ? (
        <button
          type="button"
          onClick={() => {
            onSelect(which, shown.id);
            onOpen(shown.id);
          }}
          className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 cursor-zoom-in border-2 ${
            active ? "border-yellow-400 ring-4 ring-yellow-200" : "border-transparent"
          }`}
          title="눌러서 크게 보기"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/improvement-plan/${planId}/photos/${shown.id}`}
            alt={label}
            className="w-full h-full object-cover"
          />
          <span className="absolute right-1.5 bottom-1.5 text-[11px] bg-black/55 text-white rounded px-1.5 py-0.5">
            🔍 크게 보기
          </span>
        </button>
      ) : (
        <div
          onClick={() => onSelect(which, null)}
          className={`w-full aspect-[4/3] rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 text-sm border-2 ${
            active ? "border-yellow-400 ring-4 ring-yellow-200" : "border-dashed border-slate-200"
          }`}
        >
          사진 없음
        </div>
      )}

      {photos.length > 1 && (
        <div className="flex gap-1.5">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(which, p.id)}
              className={`w-10 h-10 rounded-md overflow-hidden border-2 ${
                shown?.id === p.id ? "border-yellow-400" : "border-transparent"
              }`}
              aria-label={`${label} 사진 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/improvement-plan/${planId}/photos/${p.id}`} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs whitespace-nowrap ${active ? "font-bold text-slate-900" : "font-semibold text-slate-500"}`}>
          {active && <span className="text-yellow-500">● </span>}
          {label}
          {photos.length > 0 && (
            <span className="font-normal text-slate-400">
              {" "}
              ({photos.length}/{IMPROVEMENT_PLAN_MAX_PHOTOS})
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {canEdit && shown && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`이 ${label} 사진을 삭제할까요?`)) onDelete(shown.id);
              }}
              className="text-[11px] text-slate-400 hover:text-red-600 px-1 whitespace-nowrap disabled:opacity-40"
            >
              삭제
            </button>
          )}
          {canEdit && !full && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="text-xs font-bold bg-lime-500 hover:bg-lime-600 text-white rounded px-2 py-0.5 whitespace-nowrap disabled:opacity-40"
            >
              {busy ? "올리는 중..." : "사진+"}
            </button>
          )}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            onSelect(which, null);
            onUpload(which, f);
          }
        }}
      />
    </div>
  );
}
