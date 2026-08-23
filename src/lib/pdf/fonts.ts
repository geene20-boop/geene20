import path from "path";
import { Font } from "@react-pdf/renderer";

const FONT_FAMILY = "Noto Sans KR";

let registered = false;

// 정부 지정 서식(별지 40호·19호의2)을 한글로 렌더링하려면 한글 글리프가 포함된 폰트를 등록해야 한다.
// @react-pdf/renderer 기본 폰트(Helvetica 등)는 한글을 지원하지 않는다.
export function registerFonts(): string {
  if (!registered) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    Font.register({
      family: FONT_FAMILY,
      fonts: [
        { src: path.join(dir, "NotoSansKR-Regular.ttf"), fontWeight: 400 },
        { src: path.join(dir, "NotoSansKR-Bold.ttf"), fontWeight: 700 },
      ],
    });
    registered = true;
  }
  return FONT_FAMILY;
}
