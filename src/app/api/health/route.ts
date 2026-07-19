import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 공개 헬스체크: 앱과 DB가 살아있는지 URL 하나로 확인 (Railway 상태 점검용).
// 비밀번호 없이 접근 가능하도록 proxy.ts의 공개 경로에 등록되어 있음.
export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
    return NextResponse.json({
      status: "ok",
      db: row.ok === 1 ? "connected" : "unknown",
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String(e), time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
