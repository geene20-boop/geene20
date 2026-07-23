import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { handleLockRequest } from "@/lib/recordLock";
import { packingItemAuditLabel } from "@/lib/packingStock";
import { PackingBreakage } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  return handleLockRequest<PackingBreakage>(req, {
    idValue: id,
    table: "packing_breakage",
    auditTable: "packing_breakage",
    idColumn: "id",
    buildRecordKey: (row) => `${row.date} ${packingItemAuditLabel(db, row.key)}`,
  });
}
