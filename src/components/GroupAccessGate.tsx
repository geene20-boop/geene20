"use client";

import { ReactNode } from "react";
import { useSiteSession } from "@/lib/useSiteSession";
import { isGroupBlockedForSession } from "@/lib/navGroups";
import ForeignWorkerBlocked from "@/components/ForeignWorkerBlocked";
import AccessRestricted from "@/components/AccessRestricted";

// 원재료관리/문서관리/게시판처럼 (1)외국인 근로자 전체와 (2)특정 개인 이름에게 숨기는 메뉴를
// 화면 자체에서도 막는다 (주소를 직접 입력해도 못 보게). API 쪽은 proxy.ts의
// canAccessNavGroup이 같은 기준으로 동일하게 막는다.
export default function GroupAccessGate({
  groupLabel,
  title,
  children,
}: {
  groupLabel: string;
  title: string;
  children: ReactNode;
}) {
  const session = useSiteSession();

  if (!session.checked) {
    return <p className="text-sm text-slate-400">확인 중...</p>;
  }
  if (session.isForeignWorker && isGroupBlockedForSession(groupLabel, true, null, session.isAdmin)) {
    return <ForeignWorkerBlocked title={title} />;
  }
  if (
    session.displayName &&
    isGroupBlockedForSession(groupLabel, false, session.displayName, session.isAdmin)
  ) {
    return <AccessRestricted title={title} />;
  }
  return <>{children}</>;
}
