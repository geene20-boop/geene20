import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import NavBar from "@/components/NavBar";
import SiteGate from "@/components/SiteGate";
import { hasSitePassword, isSiteRequest } from "@/lib/auth";

export const metadata: Metadata = {
  title: "HANIL QC — 설비/품질 관리 시스템",
  description: "설비가동정보 + 비료시료 강도테스트 통합 관리 앱",
  icons: {
    icon: "/icon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "HANIL QC",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const needsGate = hasSitePassword() && !isSiteRequest({ cookies: cookieStore });

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        {needsGate ? (
          <SiteGate />
        ) : (
          <>
            <NavBar />
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
