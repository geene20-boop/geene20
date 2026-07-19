import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const db = getDb();
  db.prepare("DELETE FROM monthly_utility WHERE month = ?").run(month);
  return NextResponse.json({ ok: true });
}
