import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { QcTest, qcAvg, qcSum, qcValues } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM qc_test WHERE date BETWEEN ? AND ? ORDER BY date, time")
    .all(from, to) as QcTest[];

  const sheetRows = rows.map((r) => {
    const base: Record<string, unknown> = {
      시료No: r.sample_no ?? "",
      비종: r.fertilizer_type ?? "",
      생산일자: r.date,
      생산시각: r.time ?? "",
      측정일자: r.measured_date ?? "",
      측정시각: r.measured_time ?? "",
      조: r.shift,
    };
    for (let i = 1; i <= 20; i++) {
      base[`v${i}`] = r[`v${i}` as keyof QcTest] ?? "";
    }
    base["시료수"] = qcValues(r).length;
    base["합계"] = qcSum(r);
    base["평균"] = qcAvg(r) ?? "";
    base["버너"] = r.burner_temp ?? "";
    base["조립제당도"] = r.granulation_brix ?? "";
    base["조립제투입량"] = r.granulation_input ?? "";
    base["미분말"] = r.fine_powder ?? "";
    base["호퍼"] = r.hopper ?? "";
    base["수분"] = r.moisture ?? "";
    base["수분 비고"] = r.moisture_note ?? "";
    base["작업자"] = r.worker ?? "";
    return base;
  });

  const buffer = buildXlsxBuffer(sheetRows, "QC측정");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`QC측정_${from}_${to}.xlsx`),
  });
}
