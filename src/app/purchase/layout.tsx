"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function PurchaseLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="구매발주" title="구매발주">
      {children}
    </GroupAccessGate>
  );
}
