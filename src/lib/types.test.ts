import { describe, expect, it } from "vitest";
import { inferShift, qcAvg, qcSum, qcValues } from "@/lib/types";

const sampleTest = {
  v1: 8.1, v2: 7.2, v3: 4.5, v4: 7.9, v5: 10,
  v6: 5.3, v7: 4.2, v8: 7.7, v9: 4.4, v10: 7,
  v11: 5, v12: 8.2, v13: 8.6, v14: 5.8, v15: 6,
  v16: 8.9, v17: 9.1, v18: 9.3, v19: 8.9, v20: 4.5,
};

describe("qc helpers", () => {
  it("collects only numeric values", () => {
    expect(qcValues(sampleTest)).toHaveLength(20);
    expect(qcValues({ v1: 1, v2: null, v3: undefined })).toEqual([1]);
  });

  it("sums all 20 sample values", () => {
    expect(qcSum(sampleTest)).toBeCloseTo(140.6, 5);
  });

  it("averages all 20 sample values", () => {
    expect(qcAvg(sampleTest)).toBeCloseTo(7.03, 2);
  });

  it("returns null average when no values present", () => {
    expect(qcAvg({})).toBeNull();
  });
});

describe("inferShift", () => {
  it("treats 08:00-19:59 as day shift", () => {
    expect(inferShift("08:00")).toBe("주");
    expect(inferShift("15:00")).toBe("주");
    expect(inferShift("19:59")).toBe("주");
  });

  it("treats 20:00-07:59 as night shift", () => {
    expect(inferShift("20:00")).toBe("야");
    expect(inferShift("00:25")).toBe("야");
    expect(inferShift("07:00")).toBe("야");
  });
});
