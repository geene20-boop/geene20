export default function ForeignWorkerBlocked({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
        외국인 근로자는 이 화면을 이용할 수 없습니다. 생산·품질·제품포장 메뉴만 이용할 수 있습니다.
        <br />
        <span className="text-xs block mt-1.5">
          Foreign workers cannot use this screen. Only the Production, Quality Control, and Product
          Packing menus are available. / Người lao động nước ngoài không thể sử dụng màn hình này. Chỉ có
          thể sử dụng menu Sản xuất, Quản lý chất lượng và Đóng gói sản phẩm.
        </span>
      </p>
    </div>
  );
}
