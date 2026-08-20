"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function MsdsLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="원재료·문서" title="MSDS">
      {children}
    </GroupAccessGate>
  );
}
