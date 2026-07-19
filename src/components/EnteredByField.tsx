"use client";

export default function EnteredByField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
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
