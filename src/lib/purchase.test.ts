import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  addDays,
  computePurchaseDashboard,
  groupMonthAmount,
  kakaoMessage,
  monthlyOrderTotals,
  parseAmount,
  parsePurchaseFields,
  waitDays,
} from "@/lib/purchase";
import { PURCHASE_SCHEMA_SQL } from "@/lib/purchaseSchema";
import {
  addPurchaseComment,
  addPurchaseHistory,
  countPurchaseTodo,
  loadPurchaseView,
  loadPurchaseViews,
  placeInOrder,
  requestedOrder,
} from "@/lib/purchaseStore";
import { PurchaseRequest } from "@/lib/types";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(PURCHASE_SCHEMA_SQL);
  return db;
}

function insert(db: Database.Database, part: string, extra: Partial<PurchaseRequest> = {}): number {
  const info = db
    .prepare(
      `INSERT INTO purchase_request (part_name, purpose, purpose_detail, requested_by, budget, status, eta, received_date)
       VALUES (?, '예방정비', '테스트', '박OO', ?, ?, ?, ?)`
    )
    .run(part, extra.budget ?? 100000, extra.status ?? "requested", extra.eta ?? null, extra.received_date ?? null);
  const id = Number(info.lastInsertRowid);
  if ((extra.status ?? "requested") === "requested") placeInOrder(db, id, !!extra.urgent);
  return id;
}

const form = (o: Record<string, unknown>) => (k: string) => o[k];

describe("parsePurchaseFields", () => {
  const base = { part_name: "베어링", purpose: "예방정비", purpose_detail: "피더 소음", qty: "10", budget: "180,000" };

  it("필수값과 숫자 형식을 확인한다", () => {
    const r = parsePurchaseFields(form(base));
    expect(r).toMatchObject({ partName: "베어링", qty: 10, budget: 180000, unit: "EA", urgent: false });
    expect(parsePurchaseFields(form({ ...base, part_name: " " }))).toEqual({ error: "부품명을 입력해주세요." });
    expect(parsePurchaseFields(form({ ...base, purpose: "아무거나" }))).toEqual({ error: "사용목적을 선택해주세요." });
    expect(parsePurchaseFields(form({ ...base, purpose_detail: "" }))).toEqual({ error: "사용처·목적 상세를 입력해주세요." });
    expect(parsePurchaseFields(form({ ...base, qty: "0" }))).toEqual({ error: "수량이 올바르지 않습니다." });
    expect(parsePurchaseFields(form({ ...base, expected_date: "10/16" }))).toEqual({ error: "예상 일정이 올바르지 않습니다." });
    expect(parsePurchaseFields(form({ ...base, urgent: "1" }))).toMatchObject({ urgent: true });
  });

  it("금액 입력의 쉼표·원 표시를 허용한다", () => {
    expect(parseAmount("1,200,000원")).toBe(1200000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("-5")).toBeNull();
  });
});

describe("우선순위", () => {
  it("새 요청은 맨 아래, 긴급 요청은 맨 위로 들어가고 순위는 1부터 다시 매겨진다", () => {
    const db = makeDb();
    const a = insert(db, "A");
    const b = insert(db, "B");
    const c = insert(db, "C", { urgent: 1 });
    expect(requestedOrder(db)).toEqual([c, a, b]);
    const prio = db.prepare("SELECT id, priority FROM purchase_request ORDER BY priority").all();
    expect(prio).toEqual([
      { id: c, priority: 1 },
      { id: a, priority: 2 },
      { id: b, priority: 3 },
    ]);
  });

  it("발주·입고 건은 순위 목록에 들어가지 않는다", () => {
    const db = makeDb();
    const a = insert(db, "A");
    insert(db, "B", { status: "ordered", eta: "2026-10-20" });
    expect(requestedOrder(db)).toEqual([a]);
    expect(countPurchaseTodo(db, true)).toBe(1);
    expect(countPurchaseTodo(db, false)).toBe(0);
  });
});

describe("목록 조회", () => {
  it("단계별로 정렬하고 최근 승인자 의견과 의견 수를 붙인다", () => {
    const db = makeDb();
    const r1 = insert(db, "요청1");
    const o1 = insert(db, "발주-늦게", { status: "ordered", eta: "2026-10-30" });
    const o2 = insert(db, "발주-먼저", { status: "ordered", eta: "2026-10-18" });
    const i1 = insert(db, "입고", { status: "received", received_date: "2026-10-10" });
    addPurchaseComment(db, r1, "박OO", "요청자", "예비품 없음");
    addPurchaseComment(db, r1, "관리자", "승인자", "견적 1곳 더");
    addPurchaseComment(db, r1, "관리자", "승인자", "다음 주 승인 예정");
    addPurchaseHistory(db, r1, "박OO", "구매요청 등록");

    const views = loadPurchaseViews(db);
    expect(views.map((v) => v.id)).toEqual([r1, o2, o1, i1]);
    const v = loadPurchaseView(db, r1)!;
    expect(v.comment_count).toBe(3); // 진행 이력은 의견 수에서 뺀다
    expect(v.last_admin_comment).toBe("다음 주 승인 예정");
    expect(loadPurchaseView(db, o1)!.last_admin_comment).toBeNull();
  });
});

describe("현황판·집계", () => {
  const today = "2026-10-16";
  const row = (o: Partial<PurchaseRequest>) =>
    ({
      status: "requested",
      urgent: 0,
      requested_at: "2026-10-16 00:00:00",
      eta: null,
      received_date: null,
      kakao_shared_at: null,
      order_date: null,
      order_amount: null,
      purpose: "기타",
      vendor: null,
      ...o,
    }) as PurchaseRequest;

  it("승인대기·긴급·오래 대기·지연·이번 달 입고와 발주금액을 센다", () => {
    const d = computePurchaseDashboard(
      [
        row({ urgent: 1 }),
        row({ requested_at: "2026-10-10 00:00:00" }),
        row({ status: "ordered", eta: "2026-10-14", order_date: "2026-10-05", order_amount: 570000 }),
        row({ status: "ordered", eta: "2026-10-20", order_date: "2026-10-08", order_amount: 1850000 }),
        row({ status: "received", received_date: "2026-10-11", order_date: "2026-10-01", order_amount: 1150000, kakao_shared_at: "x" }),
        row({ status: "received", received_date: "2026-10-03", order_date: "2026-09-26", order_amount: 1420000 }),
      ],
      today
    );
    expect(d).toMatchObject({
      pending: 2,
      urgent: 1,
      oldWaiting: 1,
      ordered: 2,
      late: 1,
      dueSoon: 1,
      receivedThisMonth: 2,
      unsharedThisMonth: 1,
      monthAmount: 570000 + 1850000 + 1150000,
    });
  });

  it("최근 6개월 발주금액과 사용목적·구입처별 합계를 만든다", () => {
    const rows = [
      row({ order_date: "2026-10-02", order_amount: 100, purpose: "예방정비", vendor: "대성필터" }),
      row({ order_date: "2026-10-09", order_amount: 300, purpose: "고장수리", vendor: "대성필터" }),
      row({ order_date: "2026-05-01", order_amount: 50 }),
      row({ order_date: "2026-04-30", order_amount: 999 }), // 6개월 밖
    ];
    const m = monthlyOrderTotals(rows, today);
    expect(m.map((x) => x.label)).toEqual(["5월", "6월", "7월", "8월", "9월", "10월"]);
    expect(m[0].amount).toBe(50);
    expect(m[5].amount).toBe(400);
    expect(groupMonthAmount(rows, today, "purpose")).toEqual([
      ["고장수리", 300],
      ["예방정비", 100],
    ]);
    expect(groupMonthAmount(rows, today, "vendor")).toEqual([["대성필터", 400]]);
  });

  it("대기 일수는 한국 날짜 기준으로 센다", () => {
    // UTC 10/12 16:00 = 한국 10/13 01:00
    expect(waitDays({ requested_at: "2026-10-12 16:00:00" }, today)).toBe(3);
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
  });
});

describe("카톡 공유 문구", () => {
  it("품목·사용목적·입고 시점·금액을 담는다", () => {
    const text = kakaoMessage({
      part_name: "집진기 필터백",
      purpose: "소모품 교체",
      purpose_detail: "집진기 차압 상승",
      qty: 50,
      unit: "EA",
      vendor: "대성필터",
      received_date: "2026-10-16",
      eta: "2026-10-17",
      order_amount: 1850000,
      requested_by: "김OO",
    });
    expect(text).toContain("[입고완료] 집진기 필터백");
    expect(text).toContain("사용목적: 소모품 교체 · 집진기 차압 상승");
    expect(text).toContain("(예정보다 1일 빠름)");
    expect(text).toContain("발주금액: 1,850,000원");
  });
});
