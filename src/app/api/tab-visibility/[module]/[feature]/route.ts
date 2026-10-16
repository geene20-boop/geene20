import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { TabVisibility } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ module: string; feature: string }> }
) {
  const { module, feature } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM tab_visibility WHERE module = ? AND feature = ?").get(module, feature) as
    | TabVisibility
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "탭을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ module: string; feature: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const { module, feature } = await params;
  const body = await req.json();
  const visible = body.visible !== undefined ? (body.visible ? 1 : 0) : 1;

  const db = getDb();
  const existing = db.prepare("SELECT * FROM tab_visibility WHERE module = ? AND feature = ?").get(module, feature) as
    | TabVisibility
    | undefined;

  if (!existing) {
    return NextResponse.json({ error: "탭을 찾을 수 없습니다." }, { status: 404 });
  }

  db.prepare("UPDATE tab_visibility SET visible = ?, updated_at = datetime('now') WHERE module = ? AND feature = ?").run(
    visible,
    module,
    feature
  );

  const updated = db.prepare("SELECT * FROM tab_visibility WHERE module = ? AND feature = ?").get(module, feature);
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ module: string; feature: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }

  const { module, feature } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM tab_visibility WHERE module = ? AND feature = ?").get(module, feature) as
    | TabVisibility
    | undefined;

  if (!existing) {
    return NextResponse.json({ error: "탭을 찾을 수 없습니다." }, { status: 404 });
  }

  db.prepare("DELETE FROM tab_visibility WHERE module = ? AND feature = ?").run(module, feature);
  return NextResponse.json({ ok: true });
}
