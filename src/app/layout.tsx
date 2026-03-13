// ========================================
// File: src/app/layout.tsx
// ========================================

import "./globals.css";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import Providers from "./providers";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "SIXFL",
  description: "Six-a-side football league platform",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-white">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 pt-6 pb-8">
            {children}
          </main>
          <SiteFooter />
        </Providers>

        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}