import { NextRequest, NextResponse } from "next/server";
import { getDb, setSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM app_setting").all() as {
    key: string;
    value: string;
  }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return NextResponse.json(map);
}

export async function PUT(req: NextRequest) {
  const body = await req.json(); // { key, value }
  if (!body.key) return NextResponse.json({ error: "key는 필수입니다." }, { status: 400 });
  setSetting(body.key, body.value ?? "");
  return GET();
}
