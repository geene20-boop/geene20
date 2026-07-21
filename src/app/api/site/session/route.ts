import { NextRequest, NextResponse } from "next/server";
import { getAccountById, getUserSession, hasAnyAccount, isAdminRequest, isSiteRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const loggedIn = isSiteRequest(req);
  const isAdmin = isAdminRequest(req);
  const session = getUserSession(req);
  const account = session ? getAccountById(session.accountId) : undefined;

  return NextResponse.json({
    configured: hasAnyAccount(),
    loggedIn,
    isAdmin,
    username: isAdmin ? "관리자" : account?.username ?? null,
    displayName: isAdmin ? "관리자" : account?.display_name ?? account?.username ?? null,
    role: isAdmin ? "admin" : account?.role ?? null,
  });
}
