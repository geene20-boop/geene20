import { NextRequest } from "next/server";
import { handleLockRequest } from "@/lib/recordLock";
import { RawMaterial } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return handleLockRequest<RawMaterial>(req, {
    idValue: key,
    table: "raw_material",
    auditTable: "raw_material",
    idColumn: "key",
    buildRecordKey: (row) => `[${row.key}] ${row.name}`,
  });
}
