"use client";

import { useCallback, useEffect, useState } from "react";

export type AccountRole = "admin" | "editor" | "modifier" | "viewer";

export interface SiteSession {
  checked: boolean;
  loggedIn: boolean;
  configured: boolean; // 계정이 하나라도 있는지 (없으면 개방 모드 - 누구나 입력 가능)
  isAdmin: boolean;
  displayName: string | null;
  role: AccountRole | null;
  canWrite: boolean; // 개방 모드이거나 editor/modifier/admin이면 true, viewer면 false
  isModifier: boolean; // role이 modifier인지 (수정 권한: 승인 전 기록은 수정·삭제 가능)
  workerId: number | null; // 근로자명부와 연결된 개인계정이면 그 근로자 id (근태/연차 조회용)
  isForeignWorker: boolean; // 연동된 근로자가 외국인인지 (근태관리 접근 차단 대상)
  refresh: () => Promise<void>;
}

const initial: Omit<SiteSession, "refresh"> = {
  checked: false,
  loggedIn: false,
  configured: false,
  isAdmin: false,
  displayName: null,
  role: null,
  canWrite: true,
  isModifier: false,
  workerId: null,
  isForeignWorker: false,
};

export function useSiteSession(): SiteSession {
  const [session, setSession] = useState<Omit<SiteSession, "refresh">>(initial);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/site/session");
    const d = await res.json();
    const configured = !!d.configured;
    const role = d.role as AccountRole | null;
    setSession({
      checked: true,
      loggedIn: !!d.loggedIn,
      configured,
      isAdmin: !!d.isAdmin,
      displayName: d.displayName ?? null,
      role,
      canWrite: !configured || role === "editor" || role === "modifier" || role === "admin",
      isModifier: role === "modifier",
      workerId: d.workerId ?? null,
      isForeignWorker: d.nationality === "foreign",
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // 로그인/로그아웃은 여러 화면에 흩어진 모달에서 일어나는데, 이 훅은 화면마다 각자 인스턴스를
  // 가지므로 로그인 직후에도 다른 화면(특히 상단 메뉴)의 세션 정보가 그대로 남아있을 수 있다.
  // 로그인·로그아웃이 성공하면 어디서든 "site-session-changed" 이벤트를 쏘도록 해, 모든 인스턴스가
  // 즉시 다시 조회하게 한다.
  useEffect(() => {
    window.addEventListener("site-session-changed", refresh);
    return () => window.removeEventListener("site-session-changed", refresh);
  }, [refresh]);

  return { ...session, refresh };
}
