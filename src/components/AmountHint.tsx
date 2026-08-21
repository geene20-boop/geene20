"use client";

// 큰 금액 입력 시 오타 방지용 힌트: "31,922,900원 (약 3,192만원)"
export default function AmountHint({ value }: { value: string }) {
  const num = Number(value);
  if (!value.trim() || Number.isNaN(num) || num === 0) return null;
  let summary = "";
  if (Math.abs(num) >= 100_000_000) summary = ` (약 ${(num / 100_000_000).toFixed(1)}억원)`;
  else if (Math.abs(num) >= 10_000) summary = ` (약 ${Math.round(num / 10_000).toLocaleString()}만원)`;
  return (
    <span className="text-[11px] text-emerald-600">
      {num.toLocaleString()}원{summary}
    </span>
  );
}
