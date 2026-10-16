import { PurchasePurpose, PurchaseRequest } from "@/lib/types";

// [구매발주] 화면·API가 함께 쓰는 순수 함수와 기준값 (DB 접근 없음, 클라이언트에서도 import 가능)

export const PURCHASE_PURPOSES: PurchasePurpose[] = ["고장수리", "예방정비", "소모품 교체", "생산성 개선", "안전/환경", "기타"];

// 사용목적을 고르면 상세 칸에 채워 넣을 자주 쓰는 문구
export const PURPOSE_QUICK_TEXT: Partial<Record<PurchasePurpose, string>> = {
  고장수리: "설비 고장으로 생산 차질, 즉시 교체 필요",
  예방정비: "정기 점검 결과 마모 확인, 고장 전 선교체",
  "소모품 교체": "정기 교체 주기 도래",
  "생산성 개선": "작업 시간 단축 · 불량 감소 목적",
  "안전/환경": "안전 점검 지적 사항 조치",
};

export const PURCHASE_UNITS = ["EA", "SET", "m", "kg", "롤", "식", "BOX"];
export const PURCHASE_MONTHLY_BUDGET = 10_000_000; // 월 구매예산 (집행률 계산 기준)
export const PURCHASE_ETA_WARN_DAYS = 3; // 입고예정 며칠 전부터 D-day 경고
export const PURCHASE_WAIT_WARN_DAYS = 3; // 승인 대기 며칠 이상이면 주황색 경고
export const PURCHASE_DEFAULT_LEAD_DAYS = 7; // 승인 시 입고 예상일 기본값 (발주일 + 7일)
export const PURCHASE_MAX_FILE_SIZE = 10 * 1024 * 1024; // 첨부 1개 최대 10MB
export const PURCHASE_MAX_FILES = 5; // 한 번에 올릴 수 있는 첨부 수

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s);
}

// "1,200,000" 같은 입력을 숫자로. 빈 값은 0, 잘못된 값은 null.
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return 0;
  const n = Number(String(raw).replace(/[,\s원]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export interface ParsedPurchaseFields {
  partName: string;
  qty: number;
  unit: string;
  expectedDate: string | null;
  budget: number;
  vendor: string | null;
  purpose: PurchasePurpose;
  purposeDetail: string;
  urgent: boolean;
}

// 등록(POST)과 수정(PUT)이 함께 쓰는 입력 검증
export function parsePurchaseFields(get: (key: string) => unknown): ParsedPurchaseFields | { error: string } {
  const str = (k: string) => {
    const v = get(k);
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const partName = str("part_name").slice(0, 100);
  if (!partName) return { error: "부품명을 입력해주세요." };
  const qtyRaw = str("qty");
  const qty = qtyRaw === "" ? 1 : Number(qtyRaw.replace(/,/g, ""));
  if (!Number.isFinite(qty) || qty <= 0) return { error: "수량이 올바르지 않습니다." };
  const unit = (str("unit") || "EA").slice(0, 10);
  const expectedDate = str("expected_date") || null;
  if (expectedDate && !isValidDate(expectedDate)) return { error: "예상 일정이 올바르지 않습니다." };
  const budget = parseAmount(get("budget"));
  if (budget === null) return { error: "예산이 올바르지 않습니다." };
  const vendor = str("vendor").slice(0, 60) || null;
  const purpose = str("purpose") as PurchasePurpose;
  if (!PURCHASE_PURPOSES.includes(purpose)) return { error: "사용목적을 선택해주세요." };
  const purposeDetail = str("purpose_detail").slice(0, 300);
  if (!purposeDetail) return { error: "사용처·목적 상세를 입력해주세요." };
  const u = str("urgent");
  return {
    partName,
    qty,
    unit,
    expectedDate,
    budget,
    vendor,
    purpose,
    purposeDetail,
    urgent: u === "1" || u === "true",
  };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// DB의 created_at(UTC)을 한국 날짜(YYYY-MM-DD)로
export function kstDate(utc: string): string {
  const d = new Date(`${utc.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return utc.slice(0, 10);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function waitDays(p: Pick<PurchaseRequest, "requested_at">, today: string): number {
  return Math.max(0, daysBetween(kstDate(p.requested_at), today));
}

export function isLate(p: Pick<PurchaseRequest, "status" | "eta">, today: string): boolean {
  return p.status === "ordered" && !!p.eta && p.eta < today;
}

export interface PurchaseDashboard {
  pending: number;
  urgent: number;
  oldWaiting: number;
  ordered: number;
  dueSoon: number; // 7일 안에 입고 예정
  late: number;
  receivedThisMonth: number;
  unsharedThisMonth: number;
  monthAmount: number; // 이번 달 발주금액 (발주일 기준)
  monthBudget: number;
}

type DashRow = Pick<
  PurchaseRequest,
  "status" | "urgent" | "requested_at" | "eta" | "received_date" | "kakao_shared_at" | "order_date" | "order_amount"
>;

export function computePurchaseDashboard(rows: DashRow[], today: string): PurchaseDashboard {
  const month = today.slice(0, 7);
  const d: PurchaseDashboard = {
    pending: 0,
    urgent: 0,
    oldWaiting: 0,
    ordered: 0,
    dueSoon: 0,
    late: 0,
    receivedThisMonth: 0,
    unsharedThisMonth: 0,
    monthAmount: 0,
    monthBudget: PURCHASE_MONTHLY_BUDGET,
  };
  for (const r of rows) {
    if (r.status === "requested") {
      d.pending++;
      if (r.urgent) d.urgent++;
      if (waitDays(r, today) >= PURCHASE_WAIT_WARN_DAYS) d.oldWaiting++;
    }
    if (r.status === "ordered") {
      d.ordered++;
      if (isLate(r, today)) d.late++;
      else if (r.eta && daysBetween(today, r.eta) <= 7) d.dueSoon++;
    }
    if (r.status === "received" && r.received_date?.slice(0, 7) === month) {
      d.receivedThisMonth++;
      if (!r.kakao_shared_at) d.unsharedThisMonth++;
    }
    if (r.order_date?.slice(0, 7) === month && r.order_amount) d.monthAmount += r.order_amount;
  }
  return d;
}

// 최근 n개월(이번 달 포함) 발주금액 합계, 오래된 달부터
export function monthlyOrderTotals(
  rows: Pick<PurchaseRequest, "order_date" | "order_amount">[],
  today: string,
  months = 6
): { month: string; label: string; amount: number }[] {
  const out: { month: string; label: string; amount: number }[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1 - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, label: `${dt.getMonth() + 1}월`, amount: 0 });
  }
  const byKey = new Map(out.map((o) => [o.month, o]));
  for (const r of rows) {
    const o = r.order_date ? byKey.get(r.order_date.slice(0, 7)) : undefined;
    if (o && r.order_amount) o.amount += r.order_amount;
  }
  return out;
}

// 이번 달 발주금액을 key(사용목적·구입처)별로 합쳐 큰 순서로
export function groupMonthAmount(
  rows: Pick<PurchaseRequest, "order_date" | "order_amount" | "purpose" | "vendor">[],
  today: string,
  key: "purpose" | "vendor"
): [string, number][] {
  const month = today.slice(0, 7);
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.order_date?.slice(0, 7) !== month || !r.order_amount) continue;
    const k = (key === "vendor" ? r.vendor : r.purpose) || "미정";
    by.set(k, (by.get(k) ?? 0) + r.order_amount);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}

// 카톡 공유 문구
export function kakaoMessage(
  p: Pick<
    PurchaseRequest,
    "part_name" | "purpose" | "purpose_detail" | "qty" | "unit" | "vendor" | "received_date" | "eta" | "order_amount" | "requested_by"
  >
): string {
  let timing = "";
  if (p.received_date && p.eta) {
    const late = daysBetween(p.eta, p.received_date);
    timing = late > 0 ? ` (예정보다 ${late}일 늦음)` : late < 0 ? ` (예정보다 ${-late}일 빠름)` : " (예정일 입고)";
  }
  return [
    `[입고완료] ${p.part_name}`,
    `사용목적: ${p.purpose} · ${p.purpose_detail}`,
    `수량: ${p.qty} ${p.unit}`,
    `구입처: ${p.vendor || "미정"}`,
    `입고일: ${p.received_date ?? ""}${timing}`,
    `발주금액: ${Math.round(p.order_amount ?? 0).toLocaleString("ko-KR")}원`,
    `요청자: ${p.requested_by}`,
  ].join("\n");
}
