"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function MsdsLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="문서관리" title="MSDS">
      {children}
    </GroupAccessGate>
  );
}
