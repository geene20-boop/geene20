import { describe, expect, it } from "vitest";
import { sumPackAmount } from "@/lib/packAmount";

describe("sumPackAmount", () => {
  it("does not double count when 주/야 두 조 모두 같은 일일포장량 값을 가진 경우", () => {
    const rows = [
      { date: "2026-08-01", packAmount: 10 },
      { date: "2026-08-01", packAmount: 10 },
    ];
    expect(sumPackAmount(rows)).toBe(10);
  });

  it("sums the max value per date across multiple days", () => {
    const rows = [
      { date: "2026-08-01", packAmount: 10 },
      { date: "2026-08-01", packAmount: 10 },
      { date: "2026-08-02", packAmount: 8 },
      { date: "2026-08-02", packAmount: null },
    ];
    expect(sumPackAmount(rows)).toBe(18);
  });

  it("ignores null/undefined values", () => {
    const rows = [
      { date: "2026-08-01", packAmount: null },
      { date: "2026-08-02", packAmount: undefined },
    ];
    expect(sumPackAmount(rows)).toBe(0);
  });

  it("uses the larger of two differing shift values for the same day (never under- or double-counts)", () => {
    const rows = [
      { date: "2026-08-01", packAmount: 7 },
      { date: "2026-08-01", packAmount: 12 },
    ];
    expect(sumPackAmount(rows)).toBe(12);
  });
});
