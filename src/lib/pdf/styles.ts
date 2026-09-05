import { StyleSheet } from "@react-pdf/renderer";

export const FONT_FAMILY = "Noto Sans KR";

// 별지 40호·19호의2 두 서식이 공유하는 표 스타일 (원본 서식의 테두리 격자 + 라벨/값 칸 레이아웃을 재현)
export const sharedStyles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    padding: 28,
    color: "#111111",
  },
  formCode: {
    fontSize: 7.5,
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 14,
  },
  metaTable: {
    borderTop: "1pt solid #111111",
    borderLeft: "1pt solid #111111",
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
  },
  metaLabel: {
    backgroundColor: "#f2f2f2",
    borderRight: "1pt solid #111111",
    borderBottom: "1pt solid #111111",
    padding: 4,
    fontSize: 8.5,
    fontWeight: 700,
  },
  metaValue: {
    borderRight: "1pt solid #111111",
    borderBottom: "1pt solid #111111",
    padding: 4,
    fontSize: 8.5,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 4,
  },
  table: {
    borderTop: "1pt solid #111111",
    borderLeft: "1pt solid #111111",
  },
  tRow: {
    flexDirection: "row",
  },
  th: {
    backgroundColor: "#f2f2f2",
    borderRight: "1pt solid #111111",
    borderBottom: "1pt solid #111111",
    padding: 3,
    fontSize: 7.5,
    fontWeight: 700,
    textAlign: "center",
    justifyContent: "center",
  },
  td: {
    borderRight: "1pt solid #111111",
    borderBottom: "1pt solid #111111",
    padding: 3,
    fontSize: 8,
    justifyContent: "center",
  },
  tdCenter: {
    textAlign: "center",
  },
  tdRight: {
    textAlign: "right",
  },
  placeholderRow: {
    backgroundColor: "#fafafa",
  },
  footerNote: {
    fontSize: 6.5,
    lineHeight: 1.5,
    marginTop: 12,
    color: "#333333",
  },
  paperSize: {
    fontSize: 7,
    textAlign: "right",
    marginTop: 10,
  },
});
