"use client";

export default function EnteredByField({
  value,
  onChange,
  error,
  lockedValue,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  lockedValue?: string | null;
}) {
  if (lockedValue) {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">입력자명</span>
        <input
          type="text"
          value={lockedValue}
          disabled
          className="border rounded-md px-2 py-1.5 bg-slate-50 text-slate-500"
        />
        <span className="text-xs text-slate-400">로그인 계정으로 자동 입력됨</span>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">
        입력자명 <span className="text-red-500">*</span>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="이름을 입력하세요"
        className={`border rounded-md px-2 py-1.5 ${error ? "border-red-400" : ""}`}
      />
      {error && <span className="text-xs text-red-500">입력자명을 입력해주세요.</span>}
    </label>
  );
}
