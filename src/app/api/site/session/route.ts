import { NextRequest, NextResponse } from "next/server";
import {
  getAccountById,
  getAdminName,
  getUserSession,
  hasAnyAccount,
  isAdminRequest,
  isSiteRequest,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const loggedIn = isSiteRequest(req);
  const isAdmin = isAdminRequest(req);
  const session = getUserSession(req);
  const account = session ? getAccountById(session.accountId) : undefined;
  const adminName = isAdmin ? getAdminName(req) ?? "관리자" : null;

  return NextResponse.json({
    configured: hasAnyAccount(),
    loggedIn,
    isAdmin,
    username: isAdmin ? adminName : account?.username ?? null,
    displayName: isAdmin ? adminName : account?.display_name ?? account?.username ?? null,
    role: isAdmin ? "admin" : account?.role ?? null,
  });
}
