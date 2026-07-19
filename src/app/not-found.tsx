import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-4">
      <div className="text-4xl font-bold text-slate-300">404</div>
      <h1 className="text-lg font-bold text-slate-800">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-slate-500 max-w-md">
        주소가 바뀌었거나 없는 화면입니다. 아래 버튼으로 대시보드로 이동해주세요.
      </p>
      <Link
        href="/dashboard"
        className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium mt-2"
      >
        대시보드로 가기
      </Link>
    </div>
  );
}
