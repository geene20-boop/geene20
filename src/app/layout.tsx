import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "설비/품질 관리 시스템",
  description: "설비가동정보 + 비료시료 강도테스트 통합 관리 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        <NavBar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
