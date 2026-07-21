import { NextRequest, NextResponse } from "next/server";
import { AccountRole, createAccount, isAdminRequest, listAccounts } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  return NextResponse.json(listAccounts());
}

const VALID_ROLES: AccountRole[] = ["viewer", "editor"];

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 403 });
  }
  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const role = body.role as AccountRole;
  const displayName = body.displayName ? String(body.displayName).trim() : null;

  if (!username || username.length < 2) {
    return NextResponse.json({ error: "아이디는 2자 이상이어야 합니다." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "role은 viewer 또는 editor여야 합니다." }, { status: 400 });
  }

  try {
    const account = createAccount(username, password, role, displayName);
    return NextResponse.json(account, { status: 201 });
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return NextResponse.json({ error: `이미 존재하는 아이디입니다: ${username}` }, { status: 409 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
