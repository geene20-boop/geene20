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
  const existing = db.prepare("SELECT date, shift FROM production_log WHERE id = ?").get(id) as
    | { date: string; shift: string }
    | undefined;
  db.prepare("DELETE FROM production_log WHERE id = ?").run(id);
  if (existing) {
    logAudit("production_log", `${existing.date} ${existing.shift}조`, "delete", actor);
  }
  return NextResponse.json({ ok: true });
}

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

  if (body.carryOverride && !isAdminRequest(req)) {
    return NextResponse.json(
      { error: "전일재고량 수정은 관리자 로그인이 필요합니다." },
      { status: 403 }
    );
  }

  const existing = db.prepare("SELECT * FROM production_log WHERE id = ?").get(id) as
    | ProductionLog
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  const merged = { ...existing, ...body } as ProductionLog & Record<string, unknown>;

  const feedTotal = computeFeedTotal(
    (merged.feed_mixer as number | null) ?? null,
    (merged.feed_molder as number | null) ?? null
  );
  const lineHoursTotal = computeLineHoursTotal(
    (merged.line_hours_a as number | null) ?? null,
    (merged.line_hours_b as number | null) ?? null,
    (merged.downtime_hours as number | null) ?? null
  );

  let carryoverDryer: number | null;
  let carryoverRto: number | null;
  if (body.carryOverride) {
    carryoverDryer = body.carryover_dryer ?? null;
    carryoverRto = body.carryover_rto ?? null;
    if (existing.carryover_dryer !== carryoverDryer || existing.carryover_rto !== carryoverRto) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const auditNote = `[${stamp} 관리자가 전일재고 수정: 건조로 ${existing.carryover_dryer ?? "-"}→${carryoverDryer ?? "-"}, RTO ${existing.carryover_rto ?? "-"}→${carryoverRto ?? "-"}]`;
      const baseNote = body.note !== undefined ? body.note : existing.note;
      body.note = [baseNote, auditNote].filter(Boolean).join("\n");
      merged.note = body.note;
    }
  } else if (body.carryover_dryer !== undefined || body.carryover_rto !== undefined) {
    // 관리자 세션 없이 전일재고량 자체를 바꾸려는 시도는 무시하고 기존 값을 유지
    carryoverDryer = existing.carryover_dryer;
    carryoverRto = existing.carryover_rto;
  } else {
    const prev = getPreviousProductionLog(existing.date, existing.shift, existing.id);
    carryoverDryer = prev?.lng_dryer ?? null;
    carryoverRto = prev?.lng_rto ?? null;
  }

  const gasUsageShift = computeGasUsage({
    lngDryer: (merged.lng_dryer as number | null) ?? null,
    lngRto: (merged.lng_rto as number | null) ?? null,
    carryoverDryer,
    carryoverRto,
    fallbackGasUsageShift: (merged.gas_usage_shift as number | null) ?? null,
  });

  const cols = [
    ...PASSTHROUGH_COLUMNS,
    "feed_total",
    "line_hours_total",
    "gas_usage_shift",
    "carryover_dryer",
    "carryover_rto",
    "updated_by",
  ];
  const values: Record<string, unknown> = {
    feed_total: feedTotal,
    line_hours_total: lineHoursTotal,
    gas_usage_shift: gasUsageShift,
    carryover_dryer: carryoverDryer,
    carryover_rto: carryoverRto,
    updated_by: actor,
  };
  for (const c of PASSTHROUGH_COLUMNS) values[c] = merged[c] ?? null;
  // 이전 데이터에 최초 입력자가 없었다면 이번 수정자로 채워둔다.
  if (!existing.entered_by) values.entered_by = actor;

  const setClause = [...cols, ...(values.entered_by !== undefined ? ["entered_by"] : [])]
    .map((c) => `${c} = @${c}`)
    .join(", ");
  db.prepare(`UPDATE production_log SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(
    { ...values, id }
  );
  logAudit(
    "production_log",
    `${existing.date} ${existing.shift}조`,
    "update",
    actor,
    `${merged.product ?? ""} ${merged.daily_pack_amount != null ? merged.daily_pack_amount + "ton" : ""}`.trim() ||
      undefined
  );
  const row = db.prepare("SELECT * FROM production_log WHERE id = ?").get(id);
  return NextResponse.json(row);
}
