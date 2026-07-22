import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logAudit, requireActor } from "@/lib/audit";

const ALLOWED = [
  "sample_no",
  "fertilizer_type",
  "date",
  "shift",
  "time",
  "measured_date",
  "measured_time",
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }
  const existing = db.prepare("SELECT date, shift, sample_no FROM qc_test WHERE id = ?").get(id) as
    | { date: string; shift: string; sample_no: number | null }
    | undefined;
  db.prepare("DELETE FROM qc_test WHERE id = ?").run(id);
  if (existing) {
    logAudit(
      "qc_test",
      `${existing.date} ${existing.shift}조${existing.sample_no ? " No." + existing.sample_no : ""}`,
      "delete",
      actor
    );
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const existing = db.prepare("SELECT entered_by FROM qc_test WHERE id = ?").get(id) as
    | { entered_by: string | null }
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  const cols = [...ALLOWED.filter((c) => body[c] !== undefined), "updated_by"];
  if (!existing.entered_by) cols.push("entered_by");
  if (cols.length === 0) return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });

  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => {
    if (c === "updated_by" || c === "entered_by") return actor;
    return body[c] ?? null;
  });

  db.prepare(`UPDATE qc_test SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    id
  );
  const row = db.prepare("SELECT * FROM qc_test WHERE id = ?").get(id) as {
    date: string;
    shift: string;
    sample_no: number | null;
  };
  logAudit(
    "qc_test",
    `${row.date} ${row.shift}조${row.sample_no ? " No." + row.sample_no : ""}`,
    "update",
    actor
  );
  return NextResponse.json(row);
}
