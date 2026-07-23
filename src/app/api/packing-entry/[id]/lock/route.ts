import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { handleLockRequest } from "@/lib/recordLock";
import { packingItemAuditLabel } from "@/lib/packingStock";
import { PackingEntry } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  return handleLockRequest<PackingEntry>(req, {
    idValue: id,
    table: "packing_entry",
    auditTable: "packing_entry",
    idColumn: "id",
    buildRecordKey: (row) =>
      `${row.date} ${row.type === "pack" ? "생산" : "출하"} ${packingItemAuditLabel(db, row.product_key)}`,
  });
}
