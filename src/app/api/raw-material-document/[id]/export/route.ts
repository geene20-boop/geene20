import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialDocument, RAW_MATERIAL_JUDGMENT_LABELS } from "@/lib/types";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/exportXlsx";

type PrefillRow = {
  date: string;
  materialName: string;
  category?: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  qty: number;
  unit: string;
  unitPrice?: number | string;
  amount?: number | string;
  vehicleNo?: string;
  judgment?: "OK" | "NG";
  problem?: string;
  reason?: string;
  actionTaken?: string;
  judgedBy?: string;
  note?: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const doc = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id) as
    | RawMaterialDocument
    | undefined;
  if (!doc) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const rows = JSON.parse(doc.data_json) as PrefillRow[];
  let sheetRows: Record<string, unknown>[];

  if (doc.doc_type === "product_certificate") {
    sheetRows = rows.map((r) => ({
      원료구입일: r.date,
      원재료: r.materialName,
      공급처: r.supplierName,
      공급처주소: r.supplierAddress,
      공급처전화번호: r.supplierPhone,
      "수량(kg)": r.qty,
      단위: r.unit,
      단가: r.unitPrice ?? "",
      금액: r.amount ?? "",
      차량번호: r.vehicleNo ?? "",
      판정: r.judgment ? RAW_MATERIAL_JUDGMENT_LABELS[r.judgment] : "",
      문제점: r.problem ?? "",
      사유: r.reason ?? "",
      조치내용: r.actionTaken ?? "",
      판정자: r.judgedBy ?? "",
    }));
  } else if (doc.doc_type === "inbound_certificate") {
    sheetRows = rows.map((r) => ({
      원료구입일: r.date,
      원재료: r.materialName,
      공급처: r.supplierName,
      공급처주소: r.supplierAddress,
      공급처전화번호: r.supplierPhone,
      "수량(kg)": r.qty,
      단위: r.unit,
      비고: r.note ?? "",
    }));
  } else {
    // form19_2, form40 : 법정서식 레이아웃(공급처 주소·전화번호 포함)
    sheetRows = rows.map((r) => ({
      원료구입일: r.date,
      "비료(자재)의 종류": doc.target_material ?? "",
      "원료의 종류": r.materialName,
      구입처: r.supplierName,
      구입처주소: r.supplierAddress,
      구입처전화번호: r.supplierPhone,
      "수량(kg)": r.qty,
      비고: r.note ?? "",
    }));
  }

  const buffer = buildXlsxBuffer(sheetRows, doc.doc_type);
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`${doc.title ?? "문서"}_${doc.created_at.slice(0, 10)}.xlsx`),
  });
}
