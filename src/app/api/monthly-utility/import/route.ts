import { NextRequest, NextResponse } from "next/server";
import { importMonthlyUtility } from "@/lib/importXlsx";
import { isAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const result = importMonthlyUtility(buf);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
