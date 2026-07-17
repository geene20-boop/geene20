import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ProductionLog } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM production_log WHERE date BETWEEN ? AND ? ORDER BY date, shift DESC")
    .all(from, to) as ProductionLog[];

  const sheetRows = rows.map((r) => ({
    날짜: r.date,
    조: r.shift,
    작업자: r.worker ?? "",
    생산품목: r.product ?? "",
    조립제: r.granulation_agent ?? "",
    "일일포장량(ton)": r.daily_pack_amount ?? "",
    "건조로A(℃)": r.dryer_temp_a ?? "",
    "건조로B(℃)": r.dryer_temp_b ?? "",
    "A호퍼(Hz)": r.feed_hopper_a ?? "",
    "B호퍼(Hz)": r.feed_hopper_b ?? "",
    "A/B미분(Hz)": r.feed_fine_powder ?? "",
    "혼합기(Hz)": r.feed_mixer ?? "",
    "성형기(Hz)": r.feed_molder ?? "",
    "투입합계(Hz)": r.feed_total ?? "",
    조립제Brix: r.brix ?? "",
    "분당사용량": r.granulation_usage_per_min ?? "",
    "A라인(h)": r.line_hours_a ?? "",
    "B라인(h)": r.line_hours_b ?? "",
    "비가동(h)": r.downtime_hours ?? "",
    "실가동합계(h)": r.line_hours_total ?? "",
    건조로누계: r.lng_dryer ?? "",
    RTO누계: r.lng_rto ?? "",
    전일재고_건조로: r.carryover_dryer ?? "",
    전일재고_RTO: r.carryover_rto ?? "",
    조별사용량: r.gas_usage_shift ?? "",
    사용량합계: r.gas_usage_total ?? "",
    "가동시간당가스(㎥/h)":
      r.gas_usage_shift != null && r.line_hours_total ? +(r.gas_usage_shift / r.line_hours_total).toFixed(1) : "",
    수분: r.moisture_manual ?? "",
    경도: r.hardness_manual ?? "",
    비고: r.note ?? "",
  }));

  const buffer = buildXlsxBuffer(sheetRows, "생산일지");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`생산일지_${from}_${to}.xlsx`),
  });
}
