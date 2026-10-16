"use client";

import { useEffect, useRef, useState } from "react";

// 우선순위 목록(개선계획·구매발주)에서 함께 쓰는 순위 조작 컨트롤

// 순위 칸: 숫자를 누르면 입력칸으로 바뀌고, 옮길 순위를 입력해 Enter(또는 칸 밖을 누르면) 그 자리로 이동한다.
// Esc를 누르면 취소된다.
export function RankCell({
  rank,
  total,
  disabled,
  onMove,
}: {
  rank: number;
  total: number;
  disabled: boolean;
  onMove: (position: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const cancelled = useRef(false);

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setEditing(false);
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n !== rank) onMove(Math.min(n, total));
  }

  if (editing) {
    return (
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={total}
        value={value}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            cancelled.current = true;
            setEditing(false);
          }
        }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        className="w-14 border-2 border-sky-500 rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums"
        aria-label={`옮길 순위 (1~${total})`}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        cancelled.current = false;
        setValue(String(rank));
        setEditing(true);
      }}
      title="눌러서 옮길 순위를 입력하세요"
      className="group inline-flex items-center gap-1 min-w-[42px] px-1.5 py-0.5 rounded-md border border-dashed border-slate-300 font-semibold tabular-nums hover:border-sky-500 hover:text-sky-700 disabled:border-transparent disabled:hover:text-inherit"
    >
      {rank}
      {!disabled && <span className="text-[10px] text-slate-400 group-hover:text-sky-600">✎</span>}
    </button>
  );
}

// ⋯ 메뉴: 맨 위로 / 맨 아래로 한 번에 이동
export function MoveMenu({
  rank,
  total,
  disabled,
  onMove,
}: {
  rank: number;
  total: number;
  disabled: boolean;
  onMove: (position: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-4 border rounded text-[10px] leading-none bg-white disabled:opacity-30"
        aria-label="맨 위로/맨 아래로"
        title="맨 위로 / 맨 아래로"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-20 bg-white border rounded-lg shadow-lg p-1 flex flex-col min-w-[110px]">
          <button
            type="button"
            disabled={rank <= 1}
            onClick={() => {
              setOpen(false);
              onMove(1);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-slate-100 whitespace-nowrap disabled:opacity-30"
          >
            ⤒ 맨 위로
          </button>
          <button
            type="button"
            disabled={rank >= total}
            onClick={() => {
              setOpen(false);
              onMove(total);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-slate-100 whitespace-nowrap disabled:opacity-30"
          >
            ⤓ 맨 아래로
          </button>
        </div>
      )}
    </div>
  );
}
