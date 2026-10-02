import { Document, Page, Text, View } from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { sharedStyles as s } from "./styles";

export type Form40PdfRow = {
  date: string;
  materialName: string;
  qty: number | null;
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  note: string;
  isPlaceholder?: boolean;
};

export type Form40PdfMeta = {
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

const COL = { date: "13%", material: "16%", qty: "10%", supplierName: "14%", supplierAddr: "27%", note: "20%" };

function n(v: number | null): string {
  return v == null ? "" : v.toLocaleString("ko-KR");
}

export function Form40Pdf({
  meta,
  targetMaterial,
  rows,
}: {
  meta: Form40PdfMeta;
  targetMaterial: string;
  rows: Form40PdfRow[];
}) {
  registerFonts();
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.formCode}>
          ■ 농림축산식품부 소관 친환경농어업 육성 및 유기식품 등의 관리ㆍ지원에 관한 법률 시행규칙 [별지 제40호서식]
        </Text>
        <Text style={s.title}>유기농업자재 공시 원료ㆍ재료 수급대장</Text>

        <View style={s.metaTable}>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>공시번호</Text>
            <Text style={[s.metaValue, { width: "34%" }]}>{meta.disclosureNo || "-"}</Text>
            <Text style={[s.metaLabel, { width: "16%" }]}>최초 공시</Text>
            <Text style={[s.metaValue, { width: "34%" }]}>{meta.disclosureDate || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>업체명</Text>
            <Text style={[s.metaValue, { width: "34%" }]}>{meta.companyName || "-"}</Text>
            <Text style={[s.metaLabel, { width: "16%" }]}>대표자 성명</Text>
            <Text style={[s.metaValue, { width: "34%" }]}>{meta.companyCeo || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>사업장 소재지</Text>
            <Text style={[s.metaValue, { width: "84%" }]}>{meta.companyAddress || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>자재의 명칭</Text>
            <Text style={[s.metaValue, { width: "84%" }]}>{targetMaterial || meta.materialName || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>자재의 구분</Text>
            <Text style={[s.metaValue, { width: "84%" }]}>{meta.materialType || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>주성분(원료)의 종류 및 함량(%)</Text>
            <Text style={[s.metaValue, { width: "84%" }]}>{meta.mainIngredients || "-"}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { width: "16%" }]}>공시의 유효기간</Text>
            <Text style={[s.metaValue, { width: "84%" }]}>
              {meta.disclosureValidFrom || "-"} ~ {meta.disclosureValidTo || "-"}
            </Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>원료ㆍ재료 구입 명세</Text>
        <View style={s.table}>
          <View style={s.tRow}>
            <Text style={[s.th, { width: COL.date }]}>연월일</Text>
            <Text style={[s.th, { width: COL.material }]}>원료ㆍ재료 종류</Text>
            <Text style={[s.th, { width: COL.qty }]}>구입량(kg)</Text>
            <Text style={[s.th, { width: COL.supplierName }]}>구입처 업체명</Text>
            <Text style={[s.th, { width: COL.supplierAddr }]}>구입처 주소(전화번호)</Text>
            <Text style={[s.th, { width: COL.note }]}>비고</Text>
          </View>
          {rows.map((r, i) => (
            <View style={[s.tRow, r.isPlaceholder ? s.placeholderRow : {}]} key={i}>
              <Text style={[s.td, s.tdCenter, { width: COL.date }]}>{r.date}</Text>
              <Text style={[s.td, { width: COL.material }]}>{r.materialName}</Text>
              <Text style={[s.td, s.tdRight, { width: COL.qty }]}>{n(r.qty)}</Text>
              <Text style={[s.td, { width: COL.supplierName }]}>{r.supplierName || "-"}</Text>
              <Text style={[s.td, { width: COL.supplierAddr }]}>
                {r.supplierAddress && r.supplierPhone
                  ? `${r.supplierAddress} (${r.supplierPhone})`
                  : r.supplierAddress || r.supplierPhone || "-"}
              </Text>
              <Text style={[s.td, { width: COL.note }]}>{r.note || ""}</Text>
            </View>
          ))}
          {rows.length === 0 && (
            <View style={s.tRow}>
              <Text style={[s.td, s.tdCenter, { width: "100%" }]}>구입 명세가 없습니다.</Text>
            </View>
          )}
        </View>

        <Text style={s.footerNote}>
          [작성방법]{"\n"}
          공시번호부터 공시의 유효기간까지의 작성은 유기농업자재 공시서에 기재된 내용을 참고하여 기재하고,
          원료ㆍ재료구입 명세의 연월일은 원료ㆍ재료를 구입한 일자를 기재하며, 구입량은 원료ㆍ재료를 구입한 양을
          현물 중량 단위로 기재(부피단위를 병행하여 기재할 수 있음)하고, 구입처는 원료ㆍ재료를 구입한 업체명과
          주소(도로명 주소로 기재), 연락 가능한 전화번호를 각각 기재하며. 비고란에는 원료ㆍ재료구입 또는 사용과
          관련된 특이사항을 기재합니다.{"\n"}
          ※ 원료ㆍ재료의 구입ㆍ사용에 관한 자료 및 서류는 별도로 보관합니다.
        </Text>
        <Text style={s.paperSize}>210mm×297mm[백상지 80g/㎡(재활용품)]</Text>
      </Page>
    </Document>
  );
}
