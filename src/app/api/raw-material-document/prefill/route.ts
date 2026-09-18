import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting } from "@/lib/db";
import { RawMaterial, RawMaterialDisclosureIngredient, RawMaterialInbound, RawMaterialSupplier } from "@/lib/types";

function parseIngredients(json: string | null): RawMaterialDisclosureIngredient[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 양식출력 2단계 "데이터 미리보기"에서 쓰는 자동 프리필 조회.
// - form19_2: 기간·원재료(단일, 선택 안 하면 전체)로 입고대장 여러 건을 가져온다.
// - form40: 기간 + 원재료(자재) 1개 이상(materialKeys)으로 입고대장을 모아 가져온다. 여러 원료가
//   하나의 공시 자재(예: 백운석+당밀 → 석회고토)에 함께 쓰이는 경우를 지원하기 위함이며, 공시정보
//   (공시번호·자재구분 등)는 선택한 원료 중 첫 번째(대표 원료) 것을 사용한다.
// 두 서식 모두, 조회기간 안에서 실제 입고 기록이 하나도 없는 분기는 "YYYY년 N분기" + 비고 "실적없음"
// 자동 생성 행을 끼워 넣는다(실제 입고가 있는 분기는 건별 날짜를 그대로 보여준다).

function toKg(qty: number, unit: string | null): number {
  const u = (unit ?? "").trim();
  if (u.includes("톤") || u.toLowerCase() === "t") return qty * 1000;
  return qty;
}

function quarterLabel(dateStr: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const q = Math.floor((month - 1) / 3) + 1;
  return `${year}년 ${q}분기`;
}

// [from, to] 기간과 겹치는 모든 분기의 라벨을 순서대로 나열 ("2026년 1분기" 형태)
function quartersInRange(from: string, to: string): string[] {
  const startYear = Number(from.slice(0, 4));
  const startQ = Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1;
  const endYear = Number(to.slice(0, 4));
  const endQ = Math.floor((Number(to.slice(5, 7)) - 1) / 3) + 1;
  const labels: string[] = [];
  let y = startYear;
  let q = startQ;
  while (y < endYear || (y === endYear && q <= endQ)) {
    labels.push(`${y}년 ${q}분기`);
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return labels;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get("docType");
  const materialKey = searchParams.get("materialKey");
  const materialKeysParam = searchParams.get("materialKeys");
  const materialKeys = materialKeysParam ? materialKeysParam.split(",").filter(Boolean) : [];
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";

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

  type PrefillRowOut = {
    date: string;
    materialKey: string | undefined;
    materialName: string;
    category: string;
    supplierName: string;
    supplierAddress: string;
    supplierPhone: string;
    supplierCountry: string;
    qty: number | null;
    note: string;
    isPlaceholder: boolean;
    included: boolean;
  };

  const rows: PrefillRowOut[] = inboundRows.map((row) => {
    const material = materialByKey.get(row.material_key);
    const supplier = supplierInfo(row);
    return {
      date: row.date,
      materialKey: row.material_key,
      materialName: material ? material.name : row.material_key,
      category: material?.category ?? "",
      supplierName: supplier.name,
      supplierAddress: supplier.address,
      supplierPhone: supplier.phone,
      supplierCountry: supplier.country,
      qty: toKg(row.qty, row.unit),
      note: "",
      isPlaceholder: false,
      included: true,
    };
  });

  // 유기농업자재 공시(별지40호)에서 실제 입고 기록이 하나도 없는 분기는 "실적없음" 자동 생성 행으로 채운다.
  // (원본 서식에 실제로 있던 패턴. 별지19호의2는 건별 실제 날짜만 그대로 보여준다.)
  const primaryMaterial =
    docType === "form40" && materialKeys.length > 0 ? materialByKey.get(materialKeys[0]) : undefined;
  if (from !== "0000-01-01" && to !== "9999-12-31" && primaryMaterial) {
    const quartersWithData = new Set(rows.map((r) => quarterLabel(r.date)));
    const ingredients = parseIngredients(primaryMaterial.disclosure_ingredients_json);
    const placeholderMaterialName = primaryMaterial.main_ingredients ?? primaryMaterial.name ?? "";
    for (const label of quartersInRange(from, to)) {
      if (quartersWithData.has(label)) continue;
      // 성분별 거래처 정보(disclosure_ingredients_json)가 있으면 성분 개수만큼 행을 나눠서
      // 각 성분의 실제 구입처(업체명·주소·전화)를 자동으로 채운다. 없으면 기존 방식대로 한 줄만 넣는다.
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          rows.push({
            date: label,
            materialKey: primaryMaterial?.key,
            materialName: ing.name,
            category: primaryMaterial?.category ?? "",
            supplierName: ing.supplierName,
            supplierAddress: ing.supplierAddress,
            supplierPhone: ing.supplierPhone,
            supplierCountry: "",
            qty: null,
            note: "실적없음",
            isPlaceholder: true,
            included: true,
          });
        }
      } else {
        rows.push({
          date: label,
          materialKey: primaryMaterial?.key,
          materialName: placeholderMaterialName,
          category: primaryMaterial?.category ?? "",
          supplierName: "",
          supplierAddress: "",
          supplierPhone: "",
          supplierCountry: "",
          qty: null,
          note: "실적없음",
          isPlaceholder: true,
          included: true,
        });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  let meta: Record<string, string> | null = null;
  if (docType === "form40" && materialKeys.length > 0) {
    const primary = materialByKey.get(materialKeys[0]);
    // 자재의 명칭은 공시서에 기재된 공식 자재명(disclosure_material_name, 예: "규산질")을 우선 쓰고,
    // 없으면 기존처럼 선택한 원재료들의 내부 품목명을 나열한다.
    const allNames =
      primary?.disclosure_material_name || materialKeys.map((k) => materialByKey.get(k)?.name ?? k).join(", ");
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
