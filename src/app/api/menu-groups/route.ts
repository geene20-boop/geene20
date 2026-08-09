import { NextRequest, NextResponse } from "next/server";
import { createMenuGroup, isAdminRequest, listMenuGroups } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  return NextResponse.json(listMenuGroups());
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const allowedHrefs = Array.isArray(body.allowedHrefs)
    ? body.allowedHrefs.filter((h: unknown): h is string => typeof h === "string")
    : [];

  if (!name) {
    return NextResponse.json({ error: "그룹 이름을 입력해주세요." }, { status: 400 });
  }

  try {
    const group = createMenuGroup(name, allowedHrefs);
    return NextResponse.json(group, { status: 201 });
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return NextResponse.json({ error: `이미 존재하는 그룹 이름입니다: ${name}` }, { status: 409 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
