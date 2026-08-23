import { Document, Page, Text, View } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { sharedStyles as s } from "./styles";

export type Form19_2PdfRow = {
  date: string;
  materialName: string;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  supplierCountry: string;
  qty: number | null;
  note: string;
  isPlaceholder?: boolean;
};

const COL = {
  date: "10%",
  fertType: "9%",
  material: "11%",
  company: "10%",
  address: "16%",
  phone: "8%",
  country: "7%",
  qty: "10%",
  note: "19%",
};

function n(v: number | null): string {
  return v == null ? "" : v.toLocaleString("ko-KR");
}

export function Form19_2Pdf({ targetMaterial, rows }: { targetMaterial: string; rows: Form19_2PdfRow[] }) {
  registerFonts();
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.formCode}>■ 비료관리법 시행규칙 [별지 제19호의2서식] &lt;신설2013.4.23&gt;</Text>
        <Text style={s.title}>비료의 제조 원료 장부(비료생산업자용)</Text>

        <View style={s.table}>
          <View style={s.tRow}>
            <Text style={[s.th, { width: COL.date }]}>원료구입ㆍ수입 연월일</Text>
            <Text style={[s.th, { width: COL.fertType }]}>비료의 종류</Text>
            <Text style={[s.th, { width: COL.material }]}>원료의 종류</Text>
            <Text style={[s.th, { width: COL.company }]}>업체명</Text>
            <Text style={[s.th, { width: COL.address }]}>주소</Text>
            <Text style={[s.th, { width: COL.phone }]}>전화번호</Text>
            <Text style={[s.th, { width: COL.country }]}>생산국가</Text>
            <Text style={[s.th, { width: COL.qty }]}>원료의 수량(kg)</Text>
            <Text style={[s.th, { width: COL.note }]}>비고</Text>
          </View>
          {rows.map((r, i) => (
            <View style={[s.tRow, r.isPlaceholder ? s.placeholderRow : {}]} key={i}>
              <Text style={[s.td, s.tdCenter, { width: COL.date }]}>{r.date}</Text>
              <Text style={[s.td, { width: COL.fertType }]}>{targetMaterial || "-"}</Text>
              <Text style={[s.td, { width: COL.material }]}>{r.materialName}</Text>
              <Text style={[s.td, { width: COL.company }]}>{r.supplierName || "-"}</Text>
              <Text style={[s.td, { width: COL.address }]}>{r.supplierAddress || "-"}</Text>
              <Text style={[s.td, { width: COL.phone }]}>{r.supplierPhone || "-"}</Text>
              <Text style={[s.td, s.tdCenter, { width: COL.country }]}>{r.supplierCountry || "-"}</Text>
              <Text style={[s.td, s.tdRight, { width: COL.qty }]}>{n(r.qty)}</Text>
              <Text style={[s.td, { width: COL.note }]}>{r.note || ""}</Text>
            </View>
          ))}
          {rows.length === 0 && (
            <View style={s.tRow}>
              <Text style={[s.td, s.tdCenter, { width: "100%" }]}>원료 구입 기록이 없습니다.</Text>
            </View>
          )}
        </View>

        <Text style={s.footerNote}>
          장부 기재방법{"\n"}
          1. &apos;원료 구입ㆍ수입 연월일&apos;은 원료를 구입하거나 수입할 때마다 그 일자(예: 2013. 1. 1.)를
          기재하되, 수입하는 경우에는 수입통관 연월일을 기재하고, 이를 기준으로 나머지 항목을 작성합니다.{"\n"}
          2. &apos;비료의 종류&apos;는 구입하거나 수입한 원료를 사용하여 제조하는 비료의 종류(예: 가축분퇴비,
          퇴비, 혼합유박, 혼합유기질 등)를 기재합니다.{"\n"}
          3. &apos;원료의 종류&apos;는 짚류, 왕겨, 톱밥, 우분뇨, 골분, 채종유박 등 구입하거나 수입한 원료의
          종류를 모두 기재합니다.{"\n"}
          4. &apos;원료의 구입처&apos;는 원료의 공급 업체명, 그 주소와 전화번호, 생산 국가명을 기재합니다.{"\n"}
          5. &apos;원료의 수량&apos;은 구입하거나 수입한 원료의 수량을 각 원료별로 기재합니다.
        </Text>
        <Text style={s.paperSize}>210mm×297mm[백상지 80g/㎡(재활용품)]</Text>
      </Page>
    </Document>
  );
}
