"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="게시판" title="게시판">
      {children}
    </GroupAccessGate>
  );
}
