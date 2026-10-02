import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM raw_material ORDER BY key").all() as RawMaterial[];

  const sheetRows = rows.map((r) => ({
    코드: r.key,
    원재료명: r.name,
    성상: RAW_MATERIAL_FORM_LABELS[r.form],
    대분류: r.category ?? "",
    단위: r.unit ?? "",
    제출처: r.submit_to ?? "",
    최근단가: r.last_price ?? "",
    현재고: r.stock,
    승인여부: r.locked ? "승인완료" : "-",
  }));

  const buffer = buildXlsxBuffer(sheetRows, "품목관리");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`원재료_품목관리_${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}
