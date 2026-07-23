import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { handleLockRequest } from "@/lib/recordLock";
import { packingItemAuditLabel } from "@/lib/packingStock";
import { PackingReturn } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  return handleLockRequest<PackingReturn>(req, {
    idValue: id,
    table: "packing_return",
    auditTable: "packing_return",
    idColumn: "id",
    buildRecordKey: (row) => `${row.date} ${packingItemAuditLabel(db, row.key)}`,
  });
}
