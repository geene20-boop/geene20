import { getAdminName, isAdminRequest } from "@/lib/auth";
import { requireActor } from "@/lib/audit";
import { saveAttachmentFile } from "@/lib/fileStorage";
import { PURCHASE_MAX_FILE_SIZE, PURCHASE_MAX_FILES } from "@/lib/purchase";

type ReqLike = Parameters<typeof isAdminRequest>[0];

// [구매발주] 승인 권한: 관리자(공용 비밀번호) 로그인만 순위 변경·승인·반려/보류·입고예정일 변경을 할 수 있다.
export function isPurchaseApprover(req: ReqLike): boolean {
  return isAdminRequest(req);
}

// 기록에 남길 이름: 관리자 로그인이면 로그인할 때 입력한 이름, 그 외에는 로그인 계정(개방 모드면 입력한 이름).
export function purchaseActor(req: ReqLike, body: unknown): string | null {
  if (isAdminRequest(req)) return getAdminName(req) ?? "관리자";
  return requireActor(req, body);
}

// 폼에 담긴 첨부 파일을 검사하고 저장한다. 문제가 있으면 { error } 를 돌려준다.
export async function savePurchaseFiles(
  files: File[]
): Promise<{ name: string; path: string; mime: string }[] | { error: string }> {
  if (files.length > PURCHASE_MAX_FILES) return { error: `첨부는 한 번에 최대 ${PURCHASE_MAX_FILES}개까지 올릴 수 있습니다.` };
  for (const f of files) {
    if (f.size > PURCHASE_MAX_FILE_SIZE) return { error: `'${f.name}' 파일이 너무 큽니다. (최대 10MB)` };
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
      return { error: "사진(이미지) 또는 PDF 파일만 첨부할 수 있습니다." };
    }
  }
  const saved: { name: string; path: string; mime: string }[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    saved.push({ name: f.name, path: saveAttachmentFile("purchase", f.name, buf), mime: f.type });
  }
  return saved;
}
