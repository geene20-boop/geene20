// daily_pack_amount(일일포장량)는 그날 하루 전체의 포장량을 의미하며, 제품포장 기록에서
// 자동 제안된 같은 값이 주/야 두 조 기록에 모두 채워지는 경우가 많다. 조별로 그대로 더하면
// 하루치가 두 배로 집계되므로, 날짜별로 값이 가장 큰(=대표) 기록 하나만 취해 합산한다.
// (analytics.ts와 클라이언트 화면 양쪽에서 함께 쓸 수 있도록 DB 의존성 없이 분리했다.)
export function packAmountByDate(
  rows: { date: string; packAmount: number | null | undefined }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r.packAmount;
    if (v == null) continue;
    if (v > (map.get(r.date) ?? 0)) map.set(r.date, v);
  }
  return map;
}

export function sumPackAmount(rows: { date: string; packAmount: number | null | undefined }[]): number {
  return [...packAmountByDate(rows).values()].reduce((a, b) => a + b, 0);
}
