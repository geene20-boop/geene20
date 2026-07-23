import { NextRequest } from "next/server";
import { handleLockRequest } from "@/lib/recordLock";
import { PackingItem } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return handleLockRequest<PackingItem>(req, {
    idValue: key,
    table: "packing_item",
    auditTable: "packing_item",
    idColumn: "key",
    buildRecordKey: (row) => [row.category, row.sub].filter(Boolean).join(" ") || row.key,
  });
}
