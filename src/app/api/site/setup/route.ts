import { NextRequest, NextResponse } from "next/server";
import { clearSitePassword, isAdminRequest, setSitePassword } from "@/lib/auth";

// 관리자만 현장 공용 비밀번호를 설정/변경/해제할 수 있음
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const { password } = await req.json();
  if (password === "") {
    clearSitePassword();
    return NextResponse.json({ ok: true, cleared: true });
  }
  if (!password || String(password).length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
  }

  setSitePassword(String(password));
  return NextResponse.json({ ok: true });
}
