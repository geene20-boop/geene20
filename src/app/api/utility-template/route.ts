import { NextResponse } from "next/server";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

// 월별 유틸리티 업로드용 빈 양식 (헤더 + 예시 1행)
export async function GET() {
  const rows = [
    {
      월: "2025-07",
      "1공장 사용량(kWh)": 43355,
      "1공장 금액(원)": 8059686,
      "2공장 사용량(kWh)": 143158,
      "2공장 금액(원)": 31922900,
      "LNG 사용량(㎥)": 66733,
      "LNG 금액(원)": 54775581,
      "경유 사용량(ℓ)": 5152,
      "경유 금액(원)": 7702240,
      "생산량(ton)": 2690.2,
      비고: "예시행 — 지우고 실제 데이터를 입력하세요",
    },
  ];
  const buffer = buildXlsxBuffer(rows, "월별유틸리티양식");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders("월별유틸리티_업로드양식.xlsx"),
  });
}
