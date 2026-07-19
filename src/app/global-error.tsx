"use client";

// 루트 레이아웃 자체에서 오류가 났을 때의 최후 방어선. 자체 html/body를 렌더해야 한다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          color: "#1e293b",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 700 }}>앱을 불러오지 못했습니다</h1>
        <p style={{ fontSize: "14px", color: "#64748b", maxWidth: "420px" }}>
          잠시 후 다시 시도해주세요. 계속 반복되면 관리자에게 알려주세요.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#0f172a",
            color: "#fff",
            borderRadius: "6px",
            padding: "8px 16px",
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
        {error.digest && (
          <p style={{ fontSize: "11px", color: "#94a3b8" }}>오류 코드: {error.digest}</p>
        )}
      </body>
    </html>
  );
}
