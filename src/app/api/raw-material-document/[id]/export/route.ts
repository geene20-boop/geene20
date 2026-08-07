import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialDocument, RAW_MATERIAL_JUDGMENT_LABELS } from "@/lib/types";
import { buildXlsxBuffer, buildXlsxBufferFromAOA, xlsxResponseHeaders } from "@/lib/exportXlsx";

type PrefillRow = {
  date: string;
  materialName: string;
  category?: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  supplierCountry?: string;
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

type Form40Meta = {
  companyName: string;
  companyCeo: string;
  companyAddress: string;
  materialName: string;
  disclosureNo: string;
  disclosureDate: string;
  materialType: string;
  mainIngredients: string;
  disclosureValidFrom: string;
  disclosureValidTo: string;
};

// data_json은 {rows, meta} 형태로 저장되지만, 이전에 저장된 문서는 rows 배열만 담겨 있을 수 있어 둘 다 지원한다.
function parseDataJson(dataJson: string): { rows: PrefillRow[]; meta: Form40Meta | null } {
  const parsed = JSON.parse(dataJson);
  if (Array.isArray(parsed)) return { rows: parsed as PrefillRow[], meta: null };
  return { rows: (parsed.rows ?? []) as PrefillRow[], meta: (parsed.meta ?? null) as Form40Meta | null };
}

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

  const { rows, meta } = parseDataJson(doc.data_json);
  const filename = `${doc.title ?? "문서"}_${doc.created_at.slice(0, 10)}.xlsx`;

  if (doc.doc_type === "form40") {
    const m = meta ?? ({} as Partial<Form40Meta>);
    const aoa: unknown[][] = [
      ["■ 농림축산식품부 소관 친환경농어업 육성 및 유기식품 등의 관리·지원에 관한 법률 시행규칙 [별지 제40호서식]"],
      [],
      ["유기농업자재 공시 원료·재료 수급대장"],
      [],
      ["공시번호", m.disclosureNo ?? "", "", "최초 공시", m.disclosureDate ?? ""],
      ["업체명", m.companyName ?? "", "", "대표자 성명", m.companyCeo ?? ""],
      ["사업장 소재지", m.companyAddress ?? ""],
      ["자재의 명칭", doc.target_material ?? m.materialName ?? ""],
      ["자재의 구분", m.materialType ?? ""],
      ["주성분(원료)의 종류 및 함량(%)", m.mainIngredients ?? ""],
      ["공시의 유효기간", `${m.disclosureValidFrom ?? ""} ~ ${m.disclosureValidTo ?? ""}`],
      [],
      ["연월일", "원료·재료 종류", "구입량", "구입처 업체명", "구입처 주소(전화번호)", "비고"],
      ...rows.map((r) => [
        r.date,
        r.materialName,
        `${r.qty}${r.unit}`,
        r.supplierName,
        r.supplierAddress && r.supplierPhone
          ? `${r.supplierAddress} (${r.supplierPhone})`
          : r.supplierAddress || r.supplierPhone || "",
        r.note ?? "",
      ]),
    ];
    const buffer = buildXlsxBufferFromAOA(aoa, "별지40호서식");
    return new NextResponse(new Uint8Array(buffer), { headers: xlsxResponseHeaders(filename) });
  }

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
    // form19_2 : 비료의 제조 원료 장부(비료생산업자용) — 원본 서식 컬럼 순서 그대로
    sheetRows = rows.map((r) => ({
      "원료구입·수입 연월일": r.date,
      "비료의 종류": doc.target_material ?? "",
      "원료의 종류": r.materialName,
      업체명: r.supplierName,
      주소: r.supplierAddress,
      전화번호: r.supplierPhone,
      생산국가: r.supplierCountry ?? "",
      "원료의 수량(kg 또는 ℓ)": r.qty,
      비고: r.note ?? "",
    }));
  }

  const buffer = buildXlsxBuffer(sheetRows, doc.doc_type);
  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(filename),
  });
}
