"use client";

// 입고완료 메시지를 카카오톡으로 공유한다 (받는 사람은 카톡 화면에서 직접 고른다).
// 1) 카카오 개발자 앱 키(NEXT_PUBLIC_KAKAO_JS_KEY)가 설정되어 있으면 카카오 공유 창을 연다.
// 2) 키가 없으면 휴대폰 기본 공유 창(navigator.share)을 연다 → 목록에서 카카오톡을 고르면 된다.
// 3) 둘 다 안 되는 환경(PC 브라우저 등)이면 문구를 복사한다 → 카톡에 붙여 넣으면 된다.

type ShareResult = "kakao" | "share" | "copied" | "cancelled" | "failed";

interface KakaoSdk {
  isInitialized(): boolean;
  init(key: string): void;
  Share: { sendDefault(opts: unknown): void };
}

const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
let sdkPromise: Promise<KakaoSdk | null> | null = null;

function loadKakao(key: string): Promise<KakaoSdk | null> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    const w = window as unknown as { Kakao?: KakaoSdk };
    const ready = () => {
      try {
        if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init(key);
        resolve(w.Kakao ?? null);
      } catch {
        resolve(null);
      }
    };
    if (w.Kakao) return ready();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      sdkPromise = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareToKakao(text: string, link: string): Promise<ShareResult> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (key) {
    const kakao = await loadKakao(key);
    if (kakao) {
      try {
        kakao.Share.sendDefault({
          objectType: "text",
          text: text.slice(0, 200),
          link: { mobileWebUrl: link, webUrl: link },
          buttonTitle: "앱에서 확인하기",
        });
        return "kakao";
      } catch {
        // 아래 방법으로 넘어간다
      }
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "구매발주 입고완료", text: `${text}\n\n${link}` });
      return "share";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(`${text}\n\n${link}`)) ? "copied" : "failed";
}
