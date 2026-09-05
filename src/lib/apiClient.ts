// 세션 만료(401) 시 서버 렌더링되는 게이트 화면으로 자연스럽게 돌아가도록 새로고침
function handleUnauthorized(res: Response): boolean {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.reload();
    return true;
  }
  return false;
}

// 서버가 오류 시 항상 JSON을 준다고 가정하면 안 된다 - 배포 플랫폼의 502/504나
// 예상치 못한 크래시는 빈 본문이나 HTML 에러 페이지를 돌려줄 수 있고, 그걸 res.json()으로
// 파싱하려다 실패하면 진짜 오류 대신 "Unexpected end of JSON input" 같은 파싱 오류가
// 사용자에게 그대로 노출된다. 항상 텍스트로 먼저 읽고 JSON이면 그 안의 메시지를 쓴다.
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {
      // JSON이 아니면 원문 텍스트를 그대로 쓴다
    }
  }
  return text || `요청이 실패했습니다. (${res.status})`;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function apiDelete(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "DELETE",
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await res.text());
}
