import { NextRequest, NextResponse } from "next/server";
import { getUtilityMonthlySheet, monthsInRange } from "@/lib/analytics";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

function round(v: number | null, digits = 1): number | string {
  return v == null ? "" : +v.toFixed(digits);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from, to는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const months = monthsInRange(from, to);
  const sheet = getUtilityMonthlySheet(months);

  const rows = sheet.map((r) => ({
    월: r.month,
    "1공장 전력(kWh)": round(r.elec1Kwh),
    "1공장 금액(원)": round(r.elec1Won, 0),
    "2공장 전력(kWh)": round(r.elec2Kwh),
    "2공장 금액(원)": round(r.elec2Won, 0),
    "전력 합계(kWh)": round(r.elecTotalKwh),
    "전력 금액합계(원)": round(r.elecTotalWon, 0),
    "전력 단가(원/kWh)": round(r.elecUnitPrice, 2),
    "LNG(㎥)": round(r.lngM3),
    "LNG 금액(원)": round(r.lngWon, 0),
    "LNG 단가(원/㎥)": round(r.lngUnitPrice, 2),
    "경유(ℓ)": round(r.dieselLiter),
    "경유 금액(원)": round(r.dieselWon, 0),
    "경유 단가(원/ℓ)": round(r.dieselUnitPrice, 2),
    "생산량(ton)": round(r.productionTon, 2),
    "톤당 전력(kWh/t)": round(r.elecPerTon, 2),
    "톤당 LNG(㎥/t)": round(r.lngPerTon, 2),
    "톤당 경유(ℓ/t)": round(r.dieselPerTon, 2),
    "유틸리티 금액합계(원)": round(r.utilityWonTotal, 0),
    "톤당 유틸리티금액(원/t)": round(r.utilityWonPerTon, 0),
  }));

  const buffer = buildXlsxBuffer(rows, "월별유틸리티");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`월별유틸리티_${from}_${to}.xlsx`),
  });
}
