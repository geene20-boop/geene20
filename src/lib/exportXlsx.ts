import * as XLSX from "xlsx";

export function buildXlsxBuffer(rows: Record<string, unknown>[], sheetName: string): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// 행/열이 단순 표가 아니라 상단에 정보 블록(라벨-값 쌍)이 먼저 오는 법정서식처럼
// 자유 배치가 필요한 경우, 2차원 배열(행 단위)을 그대로 시트로 만든다.
export function buildXlsxBufferFromAOA(rows: unknown[][], sheetName: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function xlsxResponseHeaders(filename: string): HeadersInit {
  // 한글 파일명은 filename="..."에 퍼센트 인코딩된 문자열을 그대로 넣으면 브라우저가 인식하지 못해
  // "download" 같은 이름으로 저장되는 경우가 있다. RFC 5987의 filename*=UTF-8''...를 함께 보내야
  // 크롬·엣지·파이어폭스 모두에서 한글 파일명이 정상적으로 적용된다.
  const encoded = encodeURIComponent(filename);
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
  };
}
