import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { QcTest, inferShift } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";

const COLUMNS = [
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
] as const;

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM qc_test WHERE date BETWEEN ? AND ? ORDER BY date DESC, time DESC")
    .all(from, to) as QcTest[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  if (!body.date) {
    return NextResponse.json({ error: "date는 필수입니다." }, { status: 400 });
  }
  if (!body.shift && body.time) {
    body.shift = inferShift(body.time);
  }
  if (!body.shift) {
    return NextResponse.json({ error: "shift 또는 time이 필요합니다." }, { status: 400 });
  }

  const actor = requireActor(body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const cols = [...COLUMNS.filter((c) => body[c] !== undefined), "entered_by", "updated_by"];
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) =>
    c === "entered_by" || c === "updated_by" ? actor : (body[c] ?? null)
  );

  try {
    const stmt = db.prepare(`INSERT INTO qc_test (${cols.join(", ")}) VALUES (${placeholders})`);
    const info = stmt.run(...values);
    const row = db.prepare("SELECT * FROM qc_test WHERE id = ?").get(info.lastInsertRowid);
    logAudit(
      "qc_test",
      `${body.date} ${body.shift}조${body.sample_no ? " No." + body.sample_no : ""}`,
      "create",
      actor
    );
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
