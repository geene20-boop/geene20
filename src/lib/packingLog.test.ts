import { describe, expect, it } from "vitest";
import { parsePackingLogCsv, summarizePackingLog } from "@/lib/packingLog";

const sampleCsv = `id,date,type,productKey,qty,unit,topsheetKey,topsheetQty,wrapKey,wrapQty,bagMatKey
a1,2026-06-01,ship,calcium_yusang,1320,포,,0,,0,
a2,2026-06-09,pack,tonbag_gyusan,215,톤,,0,,0,bm_tonbag_liner
a3,2026-06-09,ship,calcium_yusang,720,포,,0,,0,
a4,2026-06-08,pack,gyusan_saeng,2300,포,,0,,0,bm_gyusan_sae
`;

describe("parsePackingLogCsv", () => {
  it("parses rows and normalizes dates", () => {
    const rows = parsePackingLogCsv(sampleCsv);
    expect(rows).toHaveLength(4);
    expect(rows[0].date).toBe("2026-06-01");
    expect(rows[0].qty).toBe(1320);
  });
});

describe("summarizePackingLog", () => {
  it("sums only 톤-unit pack rows into tonQty", () => {
    const rows = parsePackingLogCsv(sampleCsv);
    const summary = summarizePackingLog(rows, "2026-06-09");
    expect(summary.tonQty).toBe(215);
    expect(summary.bagPackQty).toBe(0);
  });

  it("keeps 포-unit pack rows separate from tonQty", () => {
    const rows = parsePackingLogCsv(sampleCsv);
    const summary = summarizePackingLog(rows, "2026-06-08");
    expect(summary.tonQty).toBe(0);
    expect(summary.bagPackQty).toBe(2300);
    expect(summary.bagPackCount).toBe(1);
  });

  it("excludes ship-type rows entirely", () => {
    const rows = parsePackingLogCsv(sampleCsv);
    const summary = summarizePackingLog(rows, "2026-06-01");
    expect(summary.tonQty).toBe(0);
    expect(summary.bagPackQty).toBe(0);
    expect(summary.rows).toHaveLength(0);
  });
});
