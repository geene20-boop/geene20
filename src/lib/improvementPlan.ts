import { ImprovementPlanCategory, ImprovementPlanOrgType } from "@/lib/types";

export const IMPROVEMENT_PLAN_CATEGORIES: ImprovementPlanCategory[] = ["신규", "보수"];
export const IMPROVEMENT_PLAN_ORG_TYPES: ImprovementPlanOrgType[] = ["MIP", "외주"];
export const IMPROVEMENT_PLAN_MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB (업로드 전 브라우저에서 압축하므로 넉넉히 잡은 상한)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedPlanFields {
  category: ImprovementPlanCategory;
  equipmentName: string;
  taskName: string;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  orgType: ImprovementPlanOrgType;
  vendorName: string | null;
}

// 등록(POST)과 수정(PUT)이 공유하는 폼 검증 로직. 사진 파일 처리는 두 라우트의 저장 방식이
// 달라(등록은 새 파일만, 수정은 기존 파일 교체) 각자 처리한다.
export function parsePlanForm(form: FormData): ParsedPlanFields | { error: string } {
  const category = String(form.get("category") ?? "");
  const equipmentName = String(form.get("equipment_name") ?? "").trim();
  const taskName = String(form.get("task_name") ?? "").trim();
  const startDate = form.get("start_date") ? String(form.get("start_date")) : null;
  const endDate = form.get("end_date") ? String(form.get("end_date")) : null;
  const orgType = String(form.get("org_type") ?? "");
  const vendorNameRaw = form.get("vendor_name") ? String(form.get("vendor_name")).trim() : "";
  const budgetRaw = form.get("budget");

  if (!IMPROVEMENT_PLAN_CATEGORIES.includes(category as ImprovementPlanCategory)) {
    return { error: "구분(신규/보수)이 올바르지 않습니다." };
  }
  if (!equipmentName) return { error: "설비명을 입력해주세요." };
  if (!taskName) return { error: "작업명을 입력해주세요." };
  if (startDate && !DATE_RE.test(startDate)) return { error: "예상 시작일이 올바르지 않습니다." };
  if (endDate && !DATE_RE.test(endDate)) return { error: "예상 종료일이 올바르지 않습니다." };
  if (startDate && endDate && endDate < startDate) return { error: "종료일이 시작일보다 빠릅니다." };
  if (!IMPROVEMENT_PLAN_ORG_TYPES.includes(orgType as ImprovementPlanOrgType)) {
    return { error: "시행처(MIP/외주)가 올바르지 않습니다." };
  }
  const vendorName = orgType === "외주" && vendorNameRaw ? vendorNameRaw.slice(0, 100) : null;
  const budget = Number(budgetRaw ?? 0);
  if (!Number.isFinite(budget) || budget < 0) return { error: "예산이 올바르지 않습니다." };

  return {
    category: category as ImprovementPlanCategory,
    equipmentName,
    taskName,
    startDate,
    endDate,
    budget,
    orgType: orgType as ImprovementPlanOrgType,
    vendorName,
  };
}
