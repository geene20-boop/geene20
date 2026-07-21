// 클라이언트에서도 안전하게 가져올 수 있는 순수 타입/상수 (DB 접근 코드 없음)

export type AuditTable =
  | "production_log"
  | "qc_test"
  | "electricity_usage"
  | "monthly_utility"
  | "packing_item"
  | "packing_entry"
  | "packing_restock"
  | "packing_breakage"
  | "packing_adjustment"
  | "packing_return"
  | "spec_limit";
export type AuditAction = "create" | "update" | "delete";

export interface AuditLogRow {
  id: number;
  table_name: AuditTable;
  record_key: string;
  action: AuditAction;
  actor: string;
  summary: string | null;
  created_at: string;
}

export const TABLE_LABELS: Record<AuditTable, string> = {
  production_log: "생산일지",
  qc_test: "QC측정",
  electricity_usage: "전력사용량",
  monthly_utility: "월별 유틸리티",
  packing_item: "포장 품목관리",
  packing_entry: "포장 생산/출하",
  packing_restock: "포장 입고",
  packing_breakage: "포장 파손",
  packing_adjustment: "포장 재고조정",
  packing_return: "포장 반품",
  spec_limit: "품질 기준값 설정",
};

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: "등록",
  update: "수정",
  delete: "삭제",
};
