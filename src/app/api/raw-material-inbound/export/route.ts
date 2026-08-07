import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RawMaterialInbound, RAW_MATERIAL_FORM_LABELS } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const category = searchParams.get("category");
  const materialKey = searchParams.get("materialKey");
  const supplierId = searchParams.get("supplierId");

  let sql = "SELECT * FROM raw_material_inbound WHERE date BETWEEN ? AND ?";
  const args: (string | number)[] = [from, to];
  if (materialKey) {
    sql += " AND material_key = ?";
    args.push(materialKey);
  }
  if (supplierId) {
    sql += " AND supplier_id = ?";
    args.push(Number(supplierId));
  }
  if (category) {
    sql += " AND material_key IN (SELECT key FROM raw_material WHERE category = ?)";
    args.push(category);
  }
  sql += " ORDER BY date, created_at";

  const rows = db.prepare(sql).all(...args) as RawMaterialInbound[];
  const materials = db.prepare("SELECT * FROM raw_material").all() as RawMaterial[];
  const materialByKey = new Map(materials.map((m) => [m.key, m]));

  const sheetRows: Record<string, unknown>[] = rows.map((r) => {
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

  // 공급처×품목별 합계 행을 실제 원재료수불부 서식처럼 표 아래에 함께 담는다.
  const subtotals = new Map<string, { supplier: string; material: string; qty: number; amount: number }>();
  for (const r of rows) {
    const material = materialByKey.get(r.material_key);
    const supplier = r.supplier_name ?? "미지정";
    const materialName = material ? material.name : r.material_key;
    const key = `${supplier}__${materialName}`;
    const entry = subtotals.get(key) ?? { supplier, material: materialName, qty: 0, amount: 0 };
    entry.qty += r.qty;
    entry.amount += r.amount ?? 0;
    subtotals.set(key, entry);
  }
  if (subtotals.size > 0) {
    sheetRows.push({ 날짜: "", 성상: "", 공급처: "", 품목: "", 차량번호: "", 수량: "", 단위: "", 단가: "", 금액: "", 검수판정: "", 입력자: "" });
    for (const s of subtotals.values()) {
      sheetRows.push({
        날짜: "공급처 합계",
        성상: "",
        공급처: s.supplier,
        품목: s.material,
        차량번호: "",
        수량: s.qty,
        단위: "",
        단가: "",
        금액: s.amount,
        검수판정: "",
        입력자: "",
      });
    }
    const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    const totalAmount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    sheetRows.push({
      날짜: "전체 합계",
      성상: "",
      공급처: "",
      품목: "",
      차량번호: "",
      수량: totalQty,
      단위: "",
      단가: "",
      금액: totalAmount,
      검수판정: "",
      입력자: "",
    });
  }

  const buffer = buildXlsxBuffer(sheetRows, "입고대장");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`원재료_입고대장_${from}_${to}.xlsx`),
  });
}
