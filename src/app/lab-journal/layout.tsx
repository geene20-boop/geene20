"use client";

import { ReactNode } from "react";
import GroupAccessGate from "@/components/GroupAccessGate";

export default function LabJournalLayout({ children }: { children: ReactNode }) {
  return (
    <GroupAccessGate groupLabel="원재료·문서" title="연구실험일지">
      {children}
    </GroupAccessGate>
  );
}
