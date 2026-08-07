import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RawMaterialPriceHistory } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM raw_material_price_history ORDER BY effective_date DESC, id DESC")
    .all() as RawMaterialPriceHistory[];
  const materials = db.prepare("SELECT * FROM raw_material").all() as RawMaterial[];
  const materialByKey = new Map(materials.map((m) => [m.key, m]));

  const sheetRows = rows.map((r) => {
    const material = materialByKey.get(r.material_key);
    return {
      적용일: r.effective_date,
      원재료: material ? `[${material.key}] ${material.name}` : r.material_key,
      이전단가: r.old_price ?? "",
      신규단가: r.new_price,
      증감: r.old_price != null ? r.new_price - r.old_price : "",
      등록자: r.changed_by ?? "",
      비고: r.note ?? "",
    };
  });

  const buffer = buildXlsxBuffer(sheetRows, "단가변동이력");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`원재료_단가변동이력_${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}
