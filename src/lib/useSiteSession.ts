"use client";

import { useEffect, useState } from "react";

export type AccountRole = "admin" | "editor" | "viewer";

export interface SiteSession {
  checked: boolean;
  loggedIn: boolean;
  configured: boolean; // 계정이 하나라도 있는지 (없으면 개방 모드 - 누구나 입력 가능)
  isAdmin: boolean;
  displayName: string | null;
  role: AccountRole | null;
  canWrite: boolean; // 개방 모드이거나 editor/admin이면 true, viewer면 false
}

const initial: SiteSession = {
  checked: false,
  loggedIn: false,
  configured: false,
  isAdmin: false,
  displayName: null,
  role: null,
  canWrite: true,
};

export function useSiteSession(): SiteSession {
  const [session, setSession] = useState<SiteSession>(initial);

  useEffect(() => {
    fetch("/api/site/session")
      .then((r) => r.json())
      .then((d) => {
        const configured = !!d.configured;
        const role = d.role as AccountRole | null;
        setSession({
          checked: true,
          loggedIn: !!d.loggedIn,
          configured,
          isAdmin: !!d.isAdmin,
          displayName: d.displayName ?? null,
          role,
          canWrite: !configured || role === "editor" || role === "admin",
        });
      });
  }, []);

  return session;
}
