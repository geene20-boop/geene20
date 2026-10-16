import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canEditPlanPhotos } from "@/lib/improvementPlanAuth";
import { requireActor } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { IMPROVEMENT_PLAN_MAX_PHOTO_SIZE, IMPROVEMENT_PLAN_MAX_PHOTOS } from "@/lib/improvementPlan";
import { addPhoto, countPhotos, loadPlan, loadPlanView } from "@/lib/improvementPlanStore";

// 상세 화면의 "사진+" 버튼: 개선 전/후 사진을 한 장 추가한다 (각각 최대 3장).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const plan = loadPlan(db, id);
  if (!plan) return NextResponse.json({ error: "개선계획을 찾을 수 없습니다." }, { status: 404 });
  if (!canEditPlanPhotos(req, plan)) {
    return NextResponse.json(
      { error: "이 단계에서는 사진을 바꿀 수 없습니다. (승인대기·완료 건은 승인 권한자만 가능)" },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const which = form.get("which") === "after" ? "after" : "before";
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "사진 파일을 선택해주세요." }, { status: 400 });
  }
  if (photo.size > IMPROVEMENT_PLAN_MAX_PHOTO_SIZE) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다. (최대 8MB)" }, { status: 400 });
  }
  if (!photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "이미지 파일만 첨부할 수 있습니다." }, { status: 400 });
  }
  if (countPhotos(db, id, which) >= IMPROVEMENT_PLAN_MAX_PHOTOS) {
    return NextResponse.json(
      { error: `사진은 ${which === "after" ? "개선 후" : "개선 전"} 각각 최대 ${IMPROVEMENT_PLAN_MAX_PHOTOS}장까지입니다.` },
      { status: 400 }
    );
  }
  const actor = requireActor(req, { entered_by: form.get("entered_by") });
  if (!actor) return NextResponse.json({ error: "작성자를 확인할 수 없습니다." }, { status: 400 });

  const buf = Buffer.from(await photo.arrayBuffer());
  const filePath = saveAttachmentFile("improvement-plan", photo.name, buf);
  addPhoto(db, id, which, filePath, photo.type, actor);
  db.prepare("UPDATE improvement_plan SET updated_at = datetime('now') WHERE id = ?").run(id);

  return NextResponse.json(loadPlanView(db, id), { status: 201 });
}
