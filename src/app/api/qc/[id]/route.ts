import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const ALLOWED = [
  "sample_no",
  "fertilizer_type",
  "date",
  "shift",
  "time",
  "v1", "v2", "v3", "v4", "v5",
  "v6", "v7", "v8", "v9", "v10",
  "v11", "v12", "v13", "v14", "v15",
  "v16", "v17", "v18", "v19", "v20",
  "burner_temp",
  "granulation_brix",
  "granulation_input",
  "fine_powder",
  "hopper",
  "moisture",
  "worker",
];

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM qc_test WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const cols = ALLOWED.filter((c) => body[c] !== undefined);
  if (cols.length === 0) return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });

  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => body[c] ?? null);

  db.prepare(`UPDATE qc_test SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    id
  );
  const row = db.prepare("SELECT * FROM qc_test WHERE id = ?").get(id);
  return NextResponse.json(row);
}
