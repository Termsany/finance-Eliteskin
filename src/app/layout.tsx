import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/Toast";
import { THEME_BOOT } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "المتابعة المالية — Elite Skin",
  description: "العملاء والموردين والمصروفات والربح والخسارة من دفترة",
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#10484f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Alexandria:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif" }} className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
