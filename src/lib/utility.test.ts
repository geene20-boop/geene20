import { describe, it, expect } from "vitest";
import { monthsInRange } from "@/lib/analytics";

describe("monthsInRange", () => {
  it("returns inclusive month list within a year", () => {
    expect(monthsInRange("2025-07", "2025-10")).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
    ]);
  });

  it("crosses year boundary", () => {
    expect(monthsInRange("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("single month range returns one month", () => {
    expect(monthsInRange("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("12-month span has 12 entries (YoY window)", () => {
    expect(monthsInRange("2025-07", "2026-06")).toHaveLength(12);
  });
});
