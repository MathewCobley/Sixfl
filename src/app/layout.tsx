// ========================================
// File: src/app/layout.tsx
// ========================================

import "./globals.css";
import type { ReactNode } from "react";
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
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-white">
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}