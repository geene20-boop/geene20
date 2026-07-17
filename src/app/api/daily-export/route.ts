import { NextRequest, NextResponse } from "next/server";
import { getMergedRows } from "@/lib/analytics";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";
import { getDb } from "@/lib/db";
import { ElectricityUsage } from "@/lib/types";

function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const from = `${month}-01`;
  const to = daysInMonth(month).slice(-1)[0] ?? `${month}-28`;
  const rows = getMergedRows(from, to);

  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const db = getDb();
  const electricityRows = db
    .prepare("SELECT * FROM electricity_usage WHERE date BETWEEN ? AND ?")
    .all(from, to) as ElectricityUsage[];
  const electricityByDate = new Map<string, { "1공장": number | null; "2공장": number | null }>();
  for (const e of electricityRows) {
    const entry = electricityByDate.get(e.date) ?? { "1공장": null, "2공장": null };
    entry[e.plant] = e.usage_kwh;
    electricityByDate.set(e.date, entry);
  }

  const sheetRows: Record<string, unknown>[] = [];
  for (const date of daysInMonth(month)) {
    const dayRows = (byDate.get(date) ?? []).sort((a) => (a.shift === "주" ? -1 : 1));
    const dayGasTotal = dayRows.reduce((s, r) => s + (r.production?.gas_usage_shift ?? 0), 0);
    const elec = electricityByDate.get(date);
    for (const r of dayRows) {
      const p = r.production;
      sheetRows.push({
        날짜: date,
        조: r.shift,
        작업자: p?.worker ?? "",
        생산품목: p?.product ?? "",
        조립제: p?.granulation_agent ?? "",
        "일일포장량(ton)": p?.daily_pack_amount ?? "",
        "건조로A(℃)": p?.dryer_temp_a ?? "",
        "건조로B(℃)": p?.dryer_temp_b ?? "",
        "A호퍼(Hz)": p?.feed_hopper_a ?? "",
        "B호퍼(Hz)": p?.feed_hopper_b ?? "",
        "A/B미분(Hz)": p?.feed_fine_powder ?? "",
        "혼합기(Hz)": p?.feed_mixer ?? "",
        "성형기(Hz)": p?.feed_molder ?? "",
        "투입합계(Hz)": p?.feed_total ?? "",
        조립제Brix: p?.brix ?? "",
        "A라인(h)": p?.line_hours_a ?? "",
        "B라인(h)": p?.line_hours_b ?? "",
        "비가동(h)": p?.downtime_hours ?? "",
        "실가동합계(h)": p?.line_hours_total ?? "",
        건조로누계: p?.lng_dryer ?? "",
        RTO누계: p?.lng_rto ?? "",
        조별사용량: p?.gas_usage_shift ?? "",
        "사용량합계(일계)": dayGasTotal || "",
        "가동시간당가스(㎥/h)": r.gasPerHour != null ? +r.gasPerHour.toFixed(1) : "",
        수분: r.moisture != null ? +r.moisture.toFixed(2) : "",
        경도: r.hardness != null ? +r.hardness.toFixed(2) : "",
        "1공장 저압(kWh, 일계)": elec?.["1공장"] ?? "",
        "2공장 고압(kWh, 일계)": elec?.["2공장"] ?? "",
      });
    }
    if (dayRows.length === 0 && elec) {
      sheetRows.push({
        날짜: date,
        "1공장 저압(kWh, 일계)": elec["1공장"] ?? "",
        "2공장 고압(kWh, 일계)": elec["2공장"] ?? "",
      });
    }
  }

  const buffer = buildXlsxBuffer(sheetRows, "일자별");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`일자별대시보드_${month}.xlsx`),
  });
}
