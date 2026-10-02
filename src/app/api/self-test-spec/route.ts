import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { requireActor, logAudit } from "@/lib/audit";
import { SelfTestItemSpec } from "@/lib/types";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM self_test_item_spec ORDER BY item_name")
    .all() as SelfTestItemSpec[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "품목 규격 등록은 수정 권한 이상만 가능합니다." }, { status: 403 });
  }
  const body = await req.json();
  const itemName = typeof body.item_name === "string" ? body.item_name.trim() : "";
  if (!itemName) {
    return NextResponse.json({ error: "품목명을 입력해주세요." }, { status: 400 });
  }
  const actor = requireActor(req, body);
  if (!actor) return NextResponse.json({ error: "입력자명을 확인할 수 없습니다." }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT item_name FROM self_test_item_spec WHERE item_name = ?").get(itemName);
  db.prepare(
    `INSERT INTO self_test_item_spec (item_name, specification, remarks, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(item_name) DO UPDATE SET
       specification = excluded.specification,
       remarks = excluded.remarks,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  ).run(itemName, body.specification ?? null, body.remarks ?? null, actor);

  logAudit("self_test_item_spec", itemName, existing ? "update" : "create", actor);

  const row = db.prepare("SELECT * FROM self_test_item_spec WHERE item_name = ?").get(itemName);
  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
