import { NextRequest, NextResponse } from "next/server";
import { importLeaveBalance } from "@/lib/importXlsx";
import { getAttendanceActorName, isAttendanceAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!isAttendanceAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const actor = getAttendanceActorName(req) ?? "관리자";
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const result = importLeaveBalance(buf, actor, year);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
