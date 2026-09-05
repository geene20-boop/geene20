import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const db = getDb();
    const permissions = db
      .prepare(
        `SELECT * FROM module_permission WHERE user_id = ? ORDER BY module`
      )
      .all(userId);

    return NextResponse.json(permissions);
  } catch (err) {
    console.error("GET /api/permissions:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, module: moduleName, can_view, can_create, can_update, can_delete, is_hidden } = body;

    if (!user_id || !moduleName) {
      return NextResponse.json(
        { error: "user_id and module are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO module_permission
       (user_id, module, can_view, can_create, can_update, can_delete, is_hidden, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      user_id,
      moduleName,
      can_view ? 1 : 0,
      can_create ? 1 : 0,
      can_update ? 1 : 0,
      can_delete ? 1 : 0,
      is_hidden ? 1 : 0
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/permissions:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const user_id = url.searchParams.get("user_id");
    const moduleName = url.searchParams.get("module");

    if (!user_id || !moduleName) {
      return NextResponse.json(
        { error: "user_id and module are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    db.prepare(
      `DELETE FROM module_permission WHERE user_id = ? AND module = ?`
    ).run(user_id, moduleName);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/permissions:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
