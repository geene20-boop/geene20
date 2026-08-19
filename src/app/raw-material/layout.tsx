"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function RawMaterialLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="원재료관리" title="원재료관리">
      {children}
    </GroupAccessGate>
  );
}
