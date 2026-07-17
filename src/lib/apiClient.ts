// 세션 만료(401) 시 서버 렌더링되는 게이트 화면으로 자연스럽게 돌아가도록 새로고침
function handleUnauthorized(res: Response): boolean {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.reload();
    return true;
  }
  return false;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (handleUnauthorized(res)) throw new Error("로그인이 만료되어 다시 로그인합니다.");
  if (!res.ok) throw new Error(await res.text());
}
