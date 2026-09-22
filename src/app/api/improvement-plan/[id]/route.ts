import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest, getAdminName } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteAttachmentFile } from "@/lib/fileStorage";
import { ImprovementPlan } from "@/lib/types";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "삭제는 관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM improvement_plan WHERE id = ?").get(id) as
    | ImprovementPlan
    | undefined;
  if (!row) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });

  if (row.photo_before_path) deleteAttachmentFile(row.photo_before_path);
  if (row.photo_after_path) deleteAttachmentFile(row.photo_after_path);
  db.prepare("DELETE FROM improvement_plan WHERE id = ?").run(id);

  logAudit(
    "improvement_plan",
    `${row.equipment_name} - ${row.task_name}`,
    "delete",
    getAdminName(req) ?? "관리자"
  );
  return NextResponse.json({ ok: true });
}
