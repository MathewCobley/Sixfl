// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { ReactNode } from "react";
import AppHeader from "@/components/layout/AppHeader";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <AppHeader variant="public" />
      <PublicLeagueLandingSpacingBridge />
      <main className="bg-black">{children}</main>
      <SiteFooter />
    </div>
  );
}
