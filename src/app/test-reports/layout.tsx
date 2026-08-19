"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function TestReportsLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="문서관리" title="외부기관 시험성적서">
      {children}
    </GroupAccessGate>
  );
}
