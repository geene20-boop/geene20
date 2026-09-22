import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { RawMaterialPriceHistory } from "@/lib/types";

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const materialKey = searchParams.get("materialKey");

  let sql = "SELECT * FROM raw_material_price_history";
  const args: string[] = [];
  if (materialKey) {
    sql += " WHERE material_key = ?";
    args.push(materialKey);
  }
  sql += " ORDER BY effective_date DESC, id DESC";

  const rows = db.prepare(sql).all(...args) as RawMaterialPriceHistory[];
  return NextResponse.json(rows);
}
