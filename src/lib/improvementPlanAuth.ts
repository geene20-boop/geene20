import { getImprovementPlanActorName, isEditorRequest, isImprovementPlanAdminRequest } from "@/lib/auth";
import { requireActor } from "@/lib/audit";
import { ImprovementPlan } from "@/lib/types";

type ReqLike = Parameters<typeof isEditorRequest>[0];

// 사진을 추가·삭제할 수 있는지: 진행중/재검토 건은 입력 권한자, 승인대기/완료 건은 승인 권한자만.
export function canEditPlanPhotos(req: ReqLike, plan: Pick<ImprovementPlan, "status">): boolean {
  if (isImprovementPlanAdminRequest(req)) return true;
  return isEditorRequest(req) && (plan.status === "in_progress" || plan.status === "review");
}

// 의견을 쓸 수 있는지: 입력 권한자 또는 승인 권한자
export function canCommentPlan(req: ReqLike): boolean {
  return isEditorRequest(req) || isImprovementPlanAdminRequest(req);
}

// 의견 작성자 이름: 관리자·개인 로그인이면 그 이름, 계정이 없는 개방 모드면 입력한 이름(entered_by)
export function planActorName(req: ReqLike, body: unknown): string | null {
  return getImprovementPlanActorName(req) ?? requireActor(req, body);
}
