// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { ReactNode } from "react";
import AppHeader from "@/components/layout/AppHeader";
import PublicFixtureWinChanceBridge from "@/components/layout/PublicFixtureWinChanceBridge";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import RegisterInterestClarityBridge from "@/components/layout/RegisterInterestClarityBridge";
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
      <PublicFixtureWinChanceBridge />
      <RegisterInterestClarityBridge />
      <main className="bg-black">{children}</main>
      <SiteFooter />
    </div>
  );
}
