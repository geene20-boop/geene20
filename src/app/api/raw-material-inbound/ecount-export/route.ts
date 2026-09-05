import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterial, RawMaterialInbound } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

// 이카운트 ERP "구매입고" 웹자료 업로드 양식의 컬럼 순서를 그대로 따른다.
// 거래처코드·입고창고·품목코드·외화금액·적요는 이카운트 쪽 코드와의 매핑이 아직 없어 빈 칸으로
// 두고(업로드 전 이카운트 화면에서 채움), 거래유형은 원재료 매입입고에 해당하는 이카운트 코드로 고정한다.
const TRANSACTION_TYPE = "22";

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

  // 순번은 같은 날짜 안에서 001부터 다시 매긴다.
  const seqByDate = new Map<string, number>();
  const sheetRows = rows.map((r) => {
    const material = materialByKey.get(r.material_key);
    const seq = (seqByDate.get(r.date) ?? 0) + 1;
    seqByDate.set(r.date, seq);
    return {
      일자: r.date.replaceAll("-", ""),
      순번: String(seq).padStart(3, "0"),
      거래처코드: "",
      거래처명: r.supplier_name ?? "",
      담당자: r.entered_by ?? "",
      입고창고: "",
      거래유형: TRANSACTION_TYPE,
      품목코드: "",
      품목명: material ? material.name : r.material_key,
      규격명: material?.unit ?? r.unit ?? "",
      수량: r.qty,
      단가: r.unit_price ?? "",
      외화금액: "",
      공급가액: r.amount ?? "",
      적요: "",
    };
  });

  const buffer = buildXlsxBuffer(sheetRows, "이카운트 웹자료");
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`이카운트_원재료입고_${from}_${to}.xlsx`),
  });
}
