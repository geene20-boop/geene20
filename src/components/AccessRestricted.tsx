export default function AccessRestricted({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
        이 계정은 이 화면을 이용할 수 없습니다. 접근 권한이 필요하면 관리자에게 문의해주세요.
      </p>
    </div>
  );
}
