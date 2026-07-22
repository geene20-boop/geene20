import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { getMergedRows } from "@/lib/analytics";
import { getPreviousProductionLog } from "@/lib/productionCalc";
import { fetchPackingLogCsv, parsePackingLogCsv, summarizePackingLog } from "@/lib/packingLog";
import { PACKING_LOG_CSV_URL_KEY, PACKING_LOG_LAST_SYNC_KEY } from "@/app/api/packing-log/route";
import { getDailyPackingSummary } from "@/lib/packingProductionSummary";
import { ProductionLog } from "@/lib/types";

// 생산일지 입력 화면 하나를 그릴 때 필요한 여러 참고정보(기존기록/전일재고/QC평균/포장일지)를
// API 왕복 한 번으로 모아서 돌려준다 (화면 로딩 시 요청 수 줄이기)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const shift = searchParams.get("shift");
  if (!date || !shift) {
    return NextResponse.json({ error: "date, shift는 필수입니다." }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM production_log WHERE date = ? AND shift = ?")
    .get(date, shift) as ProductionLog | undefined;

  // 직전 교대의 실제 누계값. 새 입력의 기본값으로 쓰이는 동시에, 기존 기록을 열었을 때
  // 그 기록에 저장된 전일재고가 직전 교대의 실제 값과 어긋나지 않는지 확인하는 데도 쓰인다.
  const prev = getPreviousProductionLog(date, shift);
  const carryoverPreview = { dryer: prev?.lng_dryer ?? null, rto: prev?.lng_rto ?? null };

  const mergedRows = getMergedRows(date, date);
  const match = mergedRows.find((r) => r.date === date && r.shift === shift);
  const qcRef = {
    hardness: match?.qcHardnessAvg ?? null,
    moisture: match?.qcMoistureAvg ?? null,
    brix: match?.qcBrixAvg ?? null,
  };

  let packingRef: {
    configured: boolean;
    tonQty: number | null;
    bagPackQty: number;
    bagPackCount: number;
  } | null = null;
  const csvUrl = getSetting(PACKING_LOG_CSV_URL_KEY);
  if (!csvUrl) {
    packingRef = { configured: false, tonQty: null, bagPackQty: 0, bagPackCount: 0 };
  } else {
    try {
      const csvText = await fetchPackingLogCsv(csvUrl);
      const rows = parsePackingLogCsv(csvText);
      const summary = summarizePackingLog(rows, date);
      setSetting(PACKING_LOG_LAST_SYNC_KEY, new Date().toISOString());
      packingRef = {
        configured: true,
        tonQty: summary.tonQty,
        bagPackQty: summary.bagPackQty,
        bagPackCount: summary.bagPackCount,
      };
    } catch {
      packingRef = { configured: true, tonQty: null, bagPackQty: 0, bagPackCount: 0 };
    }
  }

  const packingEntryRef = getDailyPackingSummary(db, date);

  return NextResponse.json({
    existing: existing ?? null,
    carryoverPreview,
    qcRef,
    packingRef,
    packingEntryRef,
  });
}
