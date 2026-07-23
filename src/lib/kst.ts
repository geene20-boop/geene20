// DB의 created_at/updated_at은 SQLite datetime('now')로 저장되어 UTC 기준이다.
// 화면에는 한국시간(KST, UTC+9)으로 변환해서 보여준다.
export function formatKst(utcDateTime: string): string {
  const iso = utcDateTime.includes("T") ? utcDateTime : utcDateTime.replace(" ", "T");
  const d = new Date(`${iso}Z`);
  if (Number.isNaN(d.getTime())) return utcDateTime;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
