import { NextRequest, NextResponse } from "next/server";
import { getPreviousProductionLog } from "@/lib/productionCalc";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const shift = searchParams.get("shift");
  const excludeId = searchParams.get("excludeId");
  if (!date || !shift) {
    return NextResponse.json({ error: "date, shift는 필수입니다." }, { status: 400 });
  }

  const prev = getPreviousProductionLog(date, shift, excludeId ? Number(excludeId) : undefined);
  return NextResponse.json({
    dryer: prev?.lng_dryer ?? null,
    rto: prev?.lng_rto ?? null,
  });
}
