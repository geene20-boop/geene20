import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { handleLockRequest } from "@/lib/recordLock";
import { rawMaterialAuditLabel } from "@/lib/rawMaterialStock";
import { RawMaterialInbound } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  return handleLockRequest<RawMaterialInbound>(req, {
    idValue: id,
    table: "raw_material_inbound",
    auditTable: "raw_material_inbound",
    idColumn: "id",
    buildRecordKey: (row) => `${row.date} ${rawMaterialAuditLabel(db, row.material_key)}`,
  });
}
