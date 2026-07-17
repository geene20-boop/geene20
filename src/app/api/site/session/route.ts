import { NextRequest, NextResponse } from "next/server";
import { hasSitePassword, isAdminRequest, isSiteRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    configured: hasSitePassword(),
    loggedIn: isSiteRequest(req),
    isAdmin: isAdminRequest(req),
  });
}
