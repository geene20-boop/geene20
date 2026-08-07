import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { isPmeterConfigured, runDailyPmeterSync } from "@/lib/pmeter";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  return NextResponse.json({ configured: isPmeterConfigured() });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  if (!isPmeterConfigured()) {
    return NextResponse.json(
      { error: "KEPCO_PMETER_API_KEY, KEPCO_PMETER_CUSTNO_PLANT1, KEPCO_PMETER_CUSTNO_PLANT2 환경변수를 먼저 설정해주세요." },
      { status: 400 }
    );
  }
  const results = await runDailyPmeterSync();
  return NextResponse.json({ results });
}
