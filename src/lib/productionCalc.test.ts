import { describe, expect, it } from "vitest";
import { computeFeedTotal, computeGasUsage, computeLineHoursTotal } from "@/lib/productionCalc";

describe("computeFeedTotal", () => {
  it("sums mixer and molder", () => {
    expect(computeFeedTotal(25.1, 14)).toBeCloseTo(39.1);
  });
  it("returns null when both are null", () => {
    expect(computeFeedTotal(null, null)).toBeNull();
  });
  it("treats missing side as 0", () => {
    expect(computeFeedTotal(10, null)).toBe(10);
  });
});

describe("computeLineHoursTotal", () => {
  it("sums A+B and subtracts downtime", () => {
    expect(computeLineHoursTotal(10, 2, 1)).toBe(11);
  });
  it("never goes below 0", () => {
    expect(computeLineHoursTotal(1, 0, 5)).toBe(0);
  });
  it("returns null when both line hours are null", () => {
    expect(computeLineHoursTotal(null, null, 1)).toBeNull();
  });
  it("treats missing downtime as 0", () => {
    expect(computeLineHoursTotal(12, null, null)).toBe(12);
  });
});

describe("computeGasUsage", () => {
  it("computes dryer+RTO real usage from cumulative readings minus carryover", () => {
    const result = computeGasUsage({
      lngDryer: 1300,
      lngRto: 620,
      carryoverDryer: 1000,
      carryoverRto: 500,
      fallbackGasUsageShift: null,
    });
    expect(result).toBe(420); // (1300-1000) + (620-500)
  });

  it("falls back to legacy manual value when no carryover baseline exists", () => {
    const result = computeGasUsage({
      lngDryer: 1300,
      lngRto: 620,
      carryoverDryer: null,
      carryoverRto: null,
      fallbackGasUsageShift: 3548,
    });
    expect(result).toBe(3548);
  });

  it("returns null when neither computed nor fallback is available", () => {
    const result = computeGasUsage({
      lngDryer: null,
      lngRto: null,
      carryoverDryer: null,
      carryoverRto: null,
      fallbackGasUsageShift: null,
    });
    expect(result).toBeNull();
  });

  it("computes from dryer alone when RTO carryover is missing", () => {
    const result = computeGasUsage({
      lngDryer: 1300,
      lngRto: 620,
      carryoverDryer: 1000,
      carryoverRto: null,
      fallbackGasUsageShift: null,
    });
    expect(result).toBe(300); // RTO real usage treated as 0 since only dryer side is known
  });
});
