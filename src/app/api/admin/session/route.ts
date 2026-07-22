import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminName,
  hasAdminPassword,
  hasRecoveryCodeConfigured,
  verifySessionToken,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const loggedIn = verifySessionToken(token, "admin");
  return NextResponse.json({
    passwordSet: hasAdminPassword(),
    loggedIn,
    name: loggedIn ? getAdminName(req) : null,
    recoveryAvailable: hasRecoveryCodeConfigured(),
  });
}
