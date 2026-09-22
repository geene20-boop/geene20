import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDb } from "@/lib/db";
import { RawMaterialDocument } from "@/lib/types";
import { Form40Pdf, Form40PdfMeta, Form40PdfRow } from "@/lib/pdf/Form40Pdf";
import { Form19_2Pdf, Form19_2PdfRow } from "@/lib/pdf/Form19_2Pdf";

type PrefillRow = {
  date: string;
  materialName: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  supplierCountry?: string;
  qty: number | null;
  note?: string;
  isPlaceholder?: boolean;
  included?: boolean;
};

// data_json은 {rows, meta} 형태로 저장되지만, 이전에 저장된 문서는 rows 배열만 담겨 있을 수 있어 둘 다 지원한다.
function parseDataJson(dataJson: string): { rows: PrefillRow[]; meta: Form40PdfMeta | null } {
  const parsed = JSON.parse(dataJson);
  if (Array.isArray(parsed)) return { rows: parsed as PrefillRow[], meta: null };
  return { rows: (parsed.rows ?? []) as PrefillRow[], meta: (parsed.meta ?? null) as Form40PdfMeta | null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const doc = db.prepare("SELECT * FROM raw_material_document WHERE id = ?").get(id) as
    | RawMaterialDocument
    | undefined;
  if (!doc) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const { rows, meta } = parseDataJson(doc.data_json);
  const includedRows = rows.filter((r) => r.included !== false);
  const filename = `${doc.title ?? "문서"}_${doc.created_at.slice(0, 10)}.pdf`;
  const encodedFilename = encodeURIComponent(filename);
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodedFilename}`,
  };

  if (doc.doc_type === "form40") {
    const m = meta ?? ({} as Partial<Form40PdfMeta>);
    const pdfRows: Form40PdfRow[] = includedRows.map((r) => ({
      date: r.date,
      materialName: r.materialName,
      qty: r.qty,
      supplierName: r.supplierName,
      supplierAddress: r.supplierAddress,
      supplierPhone: r.supplierPhone,
      note: r.note ?? "",
      isPlaceholder: r.isPlaceholder,
    }));
    const buffer = await renderToBuffer(
      <Form40Pdf
        meta={{
          companyName: m.companyName ?? "",
          companyCeo: m.companyCeo ?? "",
          companyAddress: m.companyAddress ?? "",
          materialName: m.materialName ?? "",
          disclosureNo: m.disclosureNo ?? "",
          disclosureDate: m.disclosureDate ?? "",
          materialType: m.materialType ?? "",
          mainIngredients: m.mainIngredients ?? "",
          disclosureValidFrom: m.disclosureValidFrom ?? "",
          disclosureValidTo: m.disclosureValidTo ?? "",
        }}
        targetMaterial={doc.target_material ?? ""}
        rows={pdfRows}
      />
    );
    return new NextResponse(new Uint8Array(buffer), { headers });
  }

  // form19_2 : 비료의 제조 원료 장부(비료생산업자용)
  const pdfRows: Form19_2PdfRow[] = includedRows.map((r) => ({
    date: r.date,
    materialName: r.materialName,
    supplierName: r.supplierName,
    supplierAddress: r.supplierAddress,
    supplierPhone: r.supplierPhone,
    supplierCountry: r.supplierCountry ?? "",
    qty: r.qty,
    note: r.note ?? "",
    isPlaceholder: r.isPlaceholder,
  }));
  const buffer = await renderToBuffer(
    <Form19_2Pdf targetMaterial={doc.target_material ?? ""} rows={pdfRows} />
  );
  return new NextResponse(new Uint8Array(buffer), { headers });
}
