"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function SelfTestLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="문서관리" title="자체시험성적서">
      {children}
    </GroupAccessGate>
  );
}
