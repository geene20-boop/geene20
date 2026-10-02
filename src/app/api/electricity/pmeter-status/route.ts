import { NextResponse } from "next/server";
import { isPmeterConfigured } from "@/lib/pmeter";

export async function GET() {
  return NextResponse.json({ configured: isPmeterConfigured() });
}
