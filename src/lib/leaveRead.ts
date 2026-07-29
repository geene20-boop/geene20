const KEY = "leave_last_seen";

// 근태관리 화면에서 본인 신청내역을 마지막으로 확인한 시각(ISO)을 브라우저에 저장해,
// 그 이후 승인/반려된 건을 홈 화면에서 "안읽음"으로 표시하는 데 사용한다.
export function getLeaveLastSeen(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markLeaveSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    // localStorage 사용 불가(시크릿 모드 등)한 경우 조용히 무시
  }
}
