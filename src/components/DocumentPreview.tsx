"use client";

import { useEffect, useRef, useState } from "react";

// PDF를 <iframe>으로 띄우면 화면에는 보이지만, 브라우저 내장 PDF 뷰어는 별도 렌더링
// 계층이라 window.print()로 부모 페이지를 인쇄할 때 대부분 비어 있거나 제외된다.
// pdf.js로 각 페이지를 <canvas>에 직접 그려서 일반 페이지 콘텐츠로 만들어야 인쇄 시에도
// 그대로 출력된다.
let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjsLibPromise;
}

export default function DocumentPreview({
  fileId,
  mimeType,
  filename,
  heightClassName = "max-h-[32rem]",
}: {
  fileId: number;
  mimeType: string | null;
  filename: string;
  heightClassName?: string;
}) {
  const src = `/api/documents/file/${fileId}`;
  const isImage = (mimeType ?? "").startsWith("image/");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isImage) return;
    let cancelled = false;
    const container = containerRef.current;
    if (container) container.innerHTML = "";

    loadPdfjs()
      .then(async (pdfjsLib) => {
        if (!cancelled) setError(false);
        const doc = await pdfjsLib.getDocument({ url: src }).promise;
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full h-auto";
          const canvasContext = canvas.getContext("2d");
          if (!canvasContext) continue;
          await page.render({ canvasContext, viewport }).promise;
          if (cancelled) return;
          containerRef.current?.appendChild(canvas);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src, isImage]);

  if (isImage) {
    return (
      <div className={`border rounded-md overflow-hidden bg-slate-50 print:border-0 print:bg-white ${heightClassName} print:max-h-none`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 원본 파일을 그대로 스트리밍해서 보여주므로 next/image 최적화 대상이 아님 */}
        <img src={src} alt={filename} className="w-full h-auto object-contain" />
      </div>
    );
  }

  return (
    <div
      className={`border rounded-md overflow-y-auto bg-slate-50 print:overflow-visible print:border-0 print:bg-white ${heightClassName} print:max-h-none`}
    >
      {error ? (
        <div className="flex items-center justify-center h-40 text-sm text-slate-400 p-4">
          미리보기를 불러올 수 없습니다.
        </div>
      ) : (
        <div ref={containerRef} className="flex flex-col items-center gap-1" />
      )}
    </div>
  );
}
