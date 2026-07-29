const KEY = "board_last_seen";

// 게시판을 마지막으로 확인한 시각(ISO)을 브라우저에 저장해, 그 이후 등록된 글을
// "안읽음"으로 표시하는 데 사용한다. 서버 상태가 아니라 이 브라우저 한정 표시일 뿐이다.
export function getBoardLastSeen(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markBoardSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    // localStorage 사용 불가(시크릿 모드 등)한 경우 조용히 무시
  }
}
