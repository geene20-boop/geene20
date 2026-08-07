import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RawMaterialInbound, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";

  const rows = db
    .prepare("SELECT * FROM raw_material_inbound WHERE date BETWEEN ? AND ? ORDER BY date, created_at")
    .all(from, to) as RawMaterialInbound[];
  const materials = db.prepare("SELECT * FROM raw_material").all() as RawMaterial[];
  const materialByKey = new Map(materials.map((m) => [m.key, m]));

  const sheetRows = rows.map((r) => {
    const material = materialByKey.get(r.material_key);
    return {
      날짜: r.date,
      성상: material ? RAW_MATERIAL_FORM_LABELS[material.form] : "",
      공급처: r.supplier_name ?? "",
      품목: material ? `[${material.key}] ${material.name}` : r.material_key,
      차량번호: r.vehicle_no ?? "",
      수량: r.qty,
      단위: r.unit ?? "",
      단가: r.unit_price ?? "",
      금액: r.amount ?? "",
      검수판정: r.judgment,
      입력자: r.entered_by ?? "",
    };
  });

  const buffer = buildXlsxBuffer(sheetRows, "입고대장");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`원재료_입고대장_${from}_${to}.xlsx`),
  });
}
