import { NextRequest, NextResponse } from "next/server";
import { importMonthlyUtility } from "@/lib/importXlsx";

export async function POST(req: NextRequest) {
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
