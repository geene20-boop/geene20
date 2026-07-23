import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { ProductionLog } from "@/lib/types";
import { logAudit, requireActor } from "@/lib/audit";
import {
  computeFeedTotal,
  computeGasUsage,
  computeLineHoursTotal,
  getPreviousProductionLog,
} from "@/lib/productionCalc";

const PASSTHROUGH_COLUMNS = [
  "product",
  "daily_pack_amount",
  "dryer_temp_a",
  "dryer_temp_b",
  "feed_hopper_a",
  "feed_hopper_b",
  "feed_fine_powder",
  "feed_mixer",
  "feed_molder",
  "brix",
  "line_hours_a",
  "line_hours_b",
  "downtime_hours",
  "lng_dryer",
  "lng_rto",
  "gas_usage_total",
  "moisture_manual",
  "hardness_manual",
  "note",
  "worker",
  "granulation_agent",
  "granulation_usage_per_min",
] as const;

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "0000-01-01";
  const to = searchParams.get("to") ?? "9999-12-31";
  const rows = db
    .prepare("SELECT * FROM production_log WHERE date BETWEEN ? AND ? ORDER BY date DESC, shift ASC")
    .all(from, to) as ProductionLog[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  if (!body.date || !body.shift) {
    return NextResponse.json({ error: "date, shift는 필수입니다." }, { status: 400 });
  }

  const actor = requireActor(req, body);
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  if (body.carryOverride && !isAdminRequest(req)) {
    return NextResponse.json(
      { error: "전일재고량 수정은 관리자 로그인이 필요합니다." },
      { status: 403 }
    );
  }

  const existing = db
    .prepare("SELECT id, locked FROM production_log WHERE date = ? AND shift = ?")
    .get(body.date, body.shift) as { id: number; locked: number } | undefined;

  if (existing?.locked) {
    return NextResponse.json(
      { error: "확정된 기록은 수정할 수 없습니다. 관리자 로그인 후 해제해주세요." },
      { status: 403 }
    );
  }

  const feedTotal = computeFeedTotal(body.feed_mixer ?? null, body.feed_molder ?? null);
  const lineHoursTotal = computeLineHoursTotal(
    body.line_hours_a ?? null,
    body.line_hours_b ?? null,
    body.downtime_hours ?? null
  );

  let carryoverDryer: number | null;
  let carryoverRto: number | null;
  let auditNote: string | null = null;
  if (body.carryOverride) {
    const existingFull = existing
      ? (db
          .prepare("SELECT carryover_dryer, carryover_rto, note FROM production_log WHERE id = ?")
          .get(existing.id) as { carryover_dryer: number | null; carryover_rto: number | null; note: string | null })
      : null;
    carryoverDryer = body.carryover_dryer ?? null;
    carryoverRto = body.carryover_rto ?? null;
    if (
      !existingFull ||
      existingFull.carryover_dryer !== carryoverDryer ||
      existingFull.carryover_rto !== carryoverRto
    ) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      auditNote = `[${stamp} 관리자가 전일재고 수정: 건조로 ${existingFull?.carryover_dryer ?? "-"}→${carryoverDryer ?? "-"}, RTO ${existingFull?.carryover_rto ?? "-"}→${carryoverRto ?? "-"}]`;
      const baseNote = body.note !== undefined ? body.note : existingFull?.note;
      body.note = [baseNote, auditNote].filter(Boolean).join("\n");
    }
  } else {
    const prev = getPreviousProductionLog(body.date, body.shift, existing?.id);
    carryoverDryer = prev?.lng_dryer ?? null;
    carryoverRto = prev?.lng_rto ?? null;
  }

  const gasUsageShift = computeGasUsage({
    lngDryer: body.lng_dryer ?? null,
    lngRto: body.lng_rto ?? null,
    carryoverDryer,
    carryoverRto,
    fallbackGasUsageShift: body.gas_usage_shift ?? null,
  });

  const cols = [
    "date",
    "shift",
    ...PASSTHROUGH_COLUMNS.filter((c) => body[c] !== undefined),
    "feed_total",
    "line_hours_total",
    "gas_usage_shift",
    "carryover_dryer",
    "carryover_rto",
    "entered_by",
    "updated_by",
  ];
  const values: Record<string, unknown> = {
    date: body.date,
    shift: body.shift,
    feed_total: feedTotal,
    line_hours_total: lineHoursTotal,
    gas_usage_shift: gasUsageShift,
    carryover_dryer: carryoverDryer,
    carryover_rto: carryoverRto,
    entered_by: actor,
    updated_by: actor,
  };
  for (const c of PASSTHROUGH_COLUMNS) {
    if (body[c] !== undefined) values[c] = body[c];
  }

  try {
    const placeholders = cols.map((c) => `@${c}`).join(", ");
    const stmt = db.prepare(
      `INSERT INTO production_log (${cols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(date, shift) DO UPDATE SET
       ${cols
         .filter((c) => c !== "entered_by")
         .map((c) => `${c} = excluded.${c}`)
         .join(", ")},
       entered_by = COALESCE(production_log.entered_by, excluded.entered_by),
       updated_at = datetime('now')`
    );
    const info = stmt.run(values);
    const row = db
      .prepare("SELECT * FROM production_log WHERE date = ? AND shift = ?")
      .get(body.date, body.shift);
    logAudit(
      "production_log",
      `${body.date} ${body.shift}조`,
      existing ? "update" : "create",
      actor,
      `${body.product ?? ""} ${body.daily_pack_amount != null ? body.daily_pack_amount + "ton" : ""}`.trim() ||
        undefined
    );
    return NextResponse.json(row, { status: info.changes ? 201 : 200 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
