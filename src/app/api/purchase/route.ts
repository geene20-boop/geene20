import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isEditorRequest } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parsePurchaseFields } from "@/lib/purchase";
import { purchaseActor, savePurchaseFiles } from "@/lib/purchaseAuth";
import {
  addPurchaseAttachment,
  addPurchaseComment,
  addPurchaseHistory,
  loadPurchaseView,
  loadPurchaseViews,
  placeInOrder,
} from "@/lib/purchaseStore";

export async function GET() {
  return NextResponse.json(loadPurchaseViews(getDb()));
}

// 구매요청 등록 (견적서·사진 첨부, 요청 의견 함께). 긴급이면 1순위로, 아니면 맨 아래 순위로 들어간다.
export async function POST(req: NextRequest) {
  if (!isEditorRequest(req)) {
    return NextResponse.json({ error: "등록은 입력 권한 이상만 가능합니다." }, { status: 403 });
  }
  const form = await req.formData();
  const parsed = parsePurchaseFields((k) => form.get(k));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const actor = purchaseActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const saved = await savePurchaseFiles(files);
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
  const note = String(form.get("note") ?? "").trim();

  const db = getDb();
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO purchase_request
          (part_name, qty, unit, expected_date, budget, vendor, purpose, purpose_detail, urgent, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.partName,
        parsed.qty,
        parsed.unit,
        parsed.expectedDate,
        parsed.budget,
        parsed.vendor,
        parsed.purpose,
        parsed.purposeDetail,
        parsed.urgent ? 1 : 0,
        actor
      );
    const newId = Number(info.lastInsertRowid);
    placeInOrder(db, newId, parsed.urgent);
    for (const s of saved) addPurchaseAttachment(db, newId, "request", s.name, s.path, s.mime, actor);
    addPurchaseHistory(db, newId, actor, parsed.urgent ? "긴급 구매요청 등록 (1순위)" : "구매요청 등록");
    if (note) addPurchaseComment(db, newId, actor, "요청자", note);
    return newId;
  })();

  logAudit("purchase_request", parsed.partName, "create", actor);
  return NextResponse.json(loadPurchaseView(db, id), { status: 201 });
}
