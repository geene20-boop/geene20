// 클라이언트에서도 안전하게 가져올 수 있는 순수 타입/상수 (DB 접근 코드 없음)

export type AuditTable = "production_log" | "qc_test" | "electricity_usage" | "monthly_utility";
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
};

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: "등록",
  update: "수정",
  delete: "삭제",
};
