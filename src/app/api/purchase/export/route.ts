import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";
import { kstDate } from "@/lib/purchase";
import { loadPurchaseViews } from "@/lib/purchaseStore";

const STATUS_LABEL: Record<string, string> = {
  requested: "구매요청(승인대기)",
  ordered: "발주",
  received: "입고완료",
  rejected: "반려",
  on_hold: "보류",
};

// 화면에서 고른 단계·사용목적·검색어 그대로 엑셀로 내려받는다. (stage=all 이면 전체)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const stage = sp.get("stage") ?? "all";
  const purpose = sp.get("purpose") ?? "";
  const q = sp.get("q") ?? "";
  const rows = loadPurchaseViews(getDb()).filter(
    (p) =>
      (stage === "all" || p.status === stage) &&
      (!purpose || p.purpose === purpose) &&
      (!q || `${p.part_name} ${p.vendor ?? ""} ${p.purpose_detail}`.includes(q))
  );
  const sheet = rows.map((p) => ({
    상태: STATUS_LABEL[p.status] ?? p.status,
    순위: p.status === "requested" ? p.priority : "",
    긴급: p.urgent ? "긴급" : "",
    부품명: p.part_name,
    사용목적: p.purpose,
    "사용처·목적": p.purpose_detail,
    수량: p.qty,
    단위: p.unit,
    "예산(원)": p.budget,
    구입처: p.vendor ?? "",
    요청자: p.requested_by,
    등록일: kstDate(p.created_at),
    예상일정: p.expected_date ?? "",
    승인자: p.approved_by ?? "",
    발주일: p.order_date ?? "",
    입고예정일: p.eta ?? "",
    "발주금액(원)": p.order_amount ?? "",
    "예산 대비(원)": p.order_amount != null ? p.order_amount - p.budget : "",
    입고수량: p.received_qty,
    입고일: p.received_date ?? "",
    입고확인자: p.received_by ?? "",
    카톡공유: p.kakao_shared_at ? "공유됨" : "",
    "반려·보류 사유": p.decline_reason ?? "",
    "최근 승인자 의견": p.last_admin_comment ?? "",
    의견수: p.comment_count,
  }));
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const buffer = buildXlsxBuffer(sheet, "구매발주");
  return new NextResponse(new Uint8Array(buffer), { headers: xlsxResponseHeaders(`구매발주_${today}.xlsx`) });
}
