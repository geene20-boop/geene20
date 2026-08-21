import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting } from "@/lib/db";
import { RawMaterial, RawMaterialInbound, RawMaterialSupplier } from "@/lib/types";

// 양식출력 2단계 "데이터 미리보기"에서 쓰는 자동 프리필 조회.
// - form19_2 / inbound_certificate: 기간·원재료(단일, 선택 안 하면 전체)로 입고대장 여러 건을 가져온다.
// - form40: 기간 + 원재료(자재) 1개 이상(materialKeys)으로 입고대장을 모아 가져온다. 여러 원료가
//   하나의 공시 자재(예: 백운석+당밀 → 석회고토)에 함께 쓰이는 경우를 지원하기 위함이며, 공시정보
//   (공시번호·자재구분 등)는 선택한 원료 중 첫 번째(대표 원료) 것을 사용한다.
// - product_certificate: 입고 건 하나(inboundId)의 상세를 가져온다.
export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get("docType");
  const materialKey = searchParams.get("materialKey");
  const materialKeysParam = searchParams.get("materialKeys");
  const materialKeys = materialKeysParam ? materialKeysParam.split(",").filter(Boolean) : [];
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const inboundId = searchParams.get("inboundId");

  const materials = db.prepare("SELECT * FROM raw_material").all() as RawMaterial[];
  const materialByKey = new Map(materials.map((m) => [m.key, m]));
  const suppliers = db.prepare("SELECT * FROM raw_material_supplier").all() as RawMaterialSupplier[];
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const supplierByName = new Map(suppliers.map((s) => [s.name, s]));

  function supplierInfo(row: RawMaterialInbound) {
    const supplier =
      (row.supplier_id != null ? supplierById.get(row.supplier_id) : undefined) ??
      (row.supplier_name ? supplierByName.get(row.supplier_name) : undefined);
    return {
      name: row.supplier_name ?? supplier?.name ?? "",
      address: supplier?.address ?? "",
      phone: supplier?.phone ?? "",
      country: supplier?.country ?? "",
    };
  }

  if (docType === "product_certificate") {
    if (!inboundId) {
      return NextResponse.json({ error: "입고 건을 선택해주세요." }, { status: 400 });
    }
    const row = db.prepare("SELECT * FROM raw_material_inbound WHERE id = ?").get(inboundId) as
      | RawMaterialInbound
      | undefined;
    if (!row) {
      return NextResponse.json({ error: "해당 입고 건을 찾을 수 없습니다." }, { status: 404 });
    }
    const material = materialByKey.get(row.material_key);
    const supplier = supplierInfo(row);
    return NextResponse.json({
      rows: [
        {
          date: row.date,
          materialKey: row.material_key,
          materialName: material ? `[${material.key}] ${material.name}` : row.material_key,
          supplierName: supplier.name,
          supplierAddress: supplier.address,
          supplierPhone: supplier.phone,
          qty: row.qty,
          unit: row.unit ?? "",
          unitPrice: row.unit_price ?? "",
          amount: row.amount ?? "",
          vehicleNo: row.vehicle_no ?? "",
          judgment: row.judgment,
          problem: row.problem ?? "",
          reason: row.reason ?? "",
          actionTaken: row.action_taken ?? "",
          judgedBy: row.judged_by ?? "",
        },
      ],
    });
  }

  if (docType === "form40" && materialKeys.length === 0) {
    return NextResponse.json({ error: "별지 제40호서식은 원재료(자재)를 1개 이상 선택해야 합니다." }, { status: 400 });
  }

  let sql = "SELECT * FROM raw_material_inbound WHERE date BETWEEN ? AND ?";
  const args: (string | number)[] = [from, to];
  if (docType === "form40") {
    sql += ` AND material_key IN (${materialKeys.map(() => "?").join(",")})`;
    args.push(...materialKeys);
  } else if (materialKey) {
    sql += " AND material_key = ?";
    args.push(materialKey);
  }
  sql += " ORDER BY date, created_at";
  const inboundRows = db.prepare(sql).all(...args) as RawMaterialInbound[];

  const rows = inboundRows.map((row) => {
    const material = materialByKey.get(row.material_key);
    const supplier = supplierInfo(row);
    return {
      date: row.date,
      materialKey: row.material_key,
      materialName: material ? `[${material.key}] ${material.name}` : row.material_key,
      category: material?.category ?? "",
      supplierName: supplier.name,
      supplierAddress: supplier.address,
      supplierPhone: supplier.phone,
      supplierCountry: supplier.country,
      qty: row.qty,
      unit: row.unit ?? "",
      note: "",
    };
  });

  let meta: Record<string, string> | null = null;
  if (docType === "form40" && materialKeys.length > 0) {
    const primary = materialByKey.get(materialKeys[0]);
    const allNames = materialKeys.map((k) => materialByKey.get(k)?.name ?? k).join(", ");
    meta = {
      companyName: getSetting("company_name") ?? "",
      companyCeo: getSetting("company_ceo") ?? "",
      companyAddress: getSetting("company_address") ?? "",
      materialName: allNames,
      disclosureNo: primary?.disclosure_no ?? "",
      disclosureDate: primary?.disclosure_date ?? "",
      materialType: primary?.material_type ?? "",
      mainIngredients: primary?.main_ingredients ?? "",
      disclosureValidFrom: primary?.disclosure_valid_from ?? "",
      disclosureValidTo: primary?.disclosure_valid_to ?? "",
    };
  }

  return NextResponse.json({ rows, meta });
}
