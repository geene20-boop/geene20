import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { TabVisibility } from "@/lib/types";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tab_visibility ORDER BY module, feature").all() as TabVisibility[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const body = await req.json();
  const moduleName = typeof body.module === "string" ? body.module.trim() : "";
  const feature = typeof body.feature === "string" ? body.feature.trim() : "";
  const visible = body.visible !== undefined ? (body.visible ? 1 : 0) : 1;

  if (!moduleName || !feature) {
    return NextResponse.json({ error: "module과 feature를 입력해주세요." }, { status: 400 });
  }

  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO tab_visibility (module, feature, visible) VALUES (?, ?, ?) ON CONFLICT(module, feature) DO UPDATE SET visible = excluded.visible, updated_at = datetime('now')"
    ).run(moduleName, feature, visible);

    const row = db.prepare("SELECT * FROM tab_visibility WHERE module = ? AND feature = ?").get(moduleName, feature);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
