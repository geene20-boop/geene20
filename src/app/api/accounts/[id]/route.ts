import { NextRequest, NextResponse } from "next/server";
import { AccountRole, isAdminRequest, resetAccountPassword, updateAccount } from "@/lib/auth";

const VALID_ROLES: AccountRole[] = ["viewer", "editor"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "role은 viewer 또는 editor여야 합니다." }, { status: 400 });
  }
  if (body.newPassword) {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 4) {
      return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    try {
      resetAccountPassword(Number(id), newPassword);
    } catch (e) {
      return NextResponse.json({ error: String((e as Error).message) }, { status: 404 });
    }
  }

  try {
    const account = updateAccount(Number(id), {
      displayName: body.displayName !== undefined ? String(body.displayName).trim() || null : undefined,
      role: body.role,
      active: body.active !== undefined ? Boolean(body.active) : undefined,
    });
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
