import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";
import { loadPlanViews } from "@/lib/improvementPlanStore";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "진행중",
  pending_approval: "승인대기",
  completed: "완료",
  review: "재검토",
};

// 화면에서 걸러 본 조건(검색어·구분·시행처·담당자) 그대로 엑셀로 내려받는다.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const cat = sp.get("cat") ?? "";
  const org = sp.get("org") ?? "";
  const assignee = sp.get("assignee") ?? "";

  const rows = loadPlanViews(getDb()).filter(
    (p) =>
      (!q || `${p.equipment_name} ${p.task_name}`.includes(q)) &&
      (!cat || p.category === cat) &&
      (!org || p.org_type === org) &&
      (!assignee || p.assignee === assignee)
  );

  const sheetRows = rows.map((p) => ({
    상태: STATUS_LABEL[p.status] ?? p.status,
    우선순위: p.status === "in_progress" || p.status === "pending_approval" ? p.priority : "",
    구분: p.category,
    설비명: p.equipment_name,
    작업명: p.task_name,
    담당자: p.assignee ?? "",
    시행처: p.org_type === "MIP" ? "MIP(자체)" : `외주${p.vendor_name ? ` (${p.vendor_name})` : ""}`,
    예상시작일: p.start_date ?? "",
    예상종료일: p.end_date ?? "",
    "예산(원)": p.budget,
    "실제 집행비(원)": p.actual_cost ?? "",
    "예산 대비(원)": p.actual_cost != null ? p.actual_cost - p.budget : "",
    재검토횟수: p.rework_count,
    재검토사유: p.review_reason ?? "",
    완료일: p.completed_at?.slice(0, 10) ?? "",
    승인자: p.approved_by ?? "",
    의견수: p.comment_count,
    작성자: p.created_by,
    등록일: p.created_at.slice(0, 10),
  }));

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const buffer = buildXlsxBuffer(sheetRows, "개선계획");
  return new NextResponse(new Uint8Array(buffer), { headers: xlsxResponseHeaders(`개선계획_${today}.xlsx`) });
}
