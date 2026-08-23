"use client";

import { useEffect, useState } from "react";

// PDF를 <iframe>으로 띄우면 화면에는 보이지만, 브라우저 내장 PDF 뷰어는 별도 렌더링
// 계층이라 window.print()로 부모 페이지를 인쇄할 때 대부분 비어 있거나 제외된다.
// pdf.js로 각 페이지를 <canvas>에 직접 그린 뒤 하나의 이미지로 이어붙여서, 성적서가
// 여러 페이지여도 인쇄 시 1페이지 안에 작게 축소된 이미지로 그대로 출력되게 한다.
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

async function renderPdfToImage(src: string): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const doc = await pdfjsLib.getDocument({ url: src }).promise;

  const pageCanvases: HTMLCanvasElement[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) continue;
    await page.render({ canvasContext, viewport }).promise;
    pageCanvases.push(canvas);
  }
  if (pageCanvases.length === 0) throw new Error("빈 문서");

  // 페이지가 여러 장이면 세로로 이어붙여 한 장의 이미지로 합친다.
  const gap = 16;
  const width = Math.max(...pageCanvases.map((c) => c.width));
  const height = pageCanvases.reduce((sum, c) => sum + c.height, 0) + gap * (pageCanvases.length - 1);
  const combined = document.createElement("canvas");
  combined.width = width;
  combined.height = height;
  const ctx = combined.getContext("2d");
  if (!ctx) throw new Error("캔버스를 생성할 수 없습니다");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const c of pageCanvases) {
    ctx.drawImage(c, (width - c.width) / 2, y);
    y += c.height + gap;
  }
  return combined.toDataURL("image/png");
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
  const [pdfImageUrl, setPdfImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isImage) return;
    let cancelled = false;

    renderPdfToImage(src)
      .then((dataUrl) => {
        if (cancelled) return;
        setError(false);
        setPdfImageUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src, isImage]);

  const imageSrc = isImage ? src : pdfImageUrl;

  return (
    <div
      className={`border rounded-md bg-slate-50 overflow-y-auto print:overflow-visible print:border-0 print:bg-white print:flex print:items-center print:justify-center print:h-[170mm] print:max-h-none ${heightClassName}`}
    >
      {error ? (
        <p className="text-sm text-slate-400 p-4">미리보기를 불러올 수 없습니다.</p>
      ) : imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- 원본 파일을 그대로 스트리밍해서 보여주므로 next/image 최적화 대상이 아님
        <img
          src={imageSrc}
          alt={filename}
          className="w-full h-auto object-contain block mx-auto print:w-auto print:h-full"
        />
      ) : (
        <p className="text-sm text-slate-400 p-4">불러오는 중...</p>
      )}
    </div>
  );
}
