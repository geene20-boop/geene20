import { NextRequest, NextResponse } from "next/server";
import { importProductionLog, importQcTests } from "@/lib/importXlsx";
import { requireActor } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind"); // 'production' | 'qc'

  if (kind !== "production" && kind !== "qc") {
    return NextResponse.json({ error: "kind는 production 또는 qc여야 합니다." }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }

  const actor = requireActor(req, { entered_by: formData.get("entered_by") });
  if (!actor) {
    return NextResponse.json({ error: "입력자명을 입력해주세요." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const result = kind === "production" ? importProductionLog(buf, actor) : importQcTests(buf, actor);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
