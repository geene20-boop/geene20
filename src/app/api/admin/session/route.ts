import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, hasAdminPassword, verifySessionToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return NextResponse.json({
    passwordSet: hasAdminPassword(),
    loggedIn: verifySessionToken(token),
  });
}
