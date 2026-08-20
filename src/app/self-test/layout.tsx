"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function SelfTestLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="원재료·문서" title="자체시험성적서">
      {children}
    </GroupAccessGate>
  );
}
