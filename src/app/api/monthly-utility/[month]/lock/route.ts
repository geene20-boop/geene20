import { NextRequest } from "next/server";
import { handleLockRequest } from "@/lib/recordLock";
import { MonthlyUtility } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  return handleLockRequest<MonthlyUtility>(req, {
    idValue: month,
    table: "monthly_utility",
    auditTable: "monthly_utility",
    idColumn: "month",
    buildRecordKey: (row) => row.month,
  });
}
