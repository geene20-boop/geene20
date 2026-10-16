function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// 기기(브라우저)의 실제 현지 날짜를 그대로 쓴다. toISOString()은 UTC 기준이라
// 한국시간(KST)과 최대 9시간 어긋나 자정 무렵 날짜가 하루 밀릴 수 있다.
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shiftDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
