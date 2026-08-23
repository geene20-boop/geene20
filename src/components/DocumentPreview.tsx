"use client";

export default function DocumentPreview({
  fileId,
  mimeType,
  filename,
  heightClassName = "h-[32rem]",
}: {
  fileId: number;
  mimeType: string | null;
  filename: string;
  heightClassName?: string;
}) {
  const src = `/api/documents/file/${fileId}`;
  const isImage = (mimeType ?? "").startsWith("image/");

  return (
    <div className={`border rounded-md overflow-hidden bg-slate-50 ${heightClassName}`}>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- 원본 파일을 그대로 스트리밍해서 보여주므로 next/image 최적화 대상이 아님
        <img src={src} alt={filename} className="w-full h-full object-contain" />
      ) : (
        <iframe src={src} title={filename} className="w-full h-full" />
      )}
    </div>
  );
}
