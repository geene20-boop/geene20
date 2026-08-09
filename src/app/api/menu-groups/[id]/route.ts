import { NextRequest, NextResponse } from "next/server";
import { deleteMenuGroup, isAdminRequest, updateMenuGroup } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const allowedHrefs = Array.isArray(body.allowedHrefs)
    ? body.allowedHrefs.filter((h: unknown): h is string => typeof h === "string")
    : [];

  if (!name) {
    return NextResponse.json({ error: "그룹 이름을 입력해주세요." }, { status: 400 });
  }

  try {
    const group = updateMenuGroup(Number(id), name, allowedHrefs);
    return NextResponse.json(group);
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return NextResponse.json({ error: `이미 존재하는 그룹 이름입니다: ${name}` }, { status: 409 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  deleteMenuGroup(Number(id));
  return NextResponse.json({ ok: true });
}
