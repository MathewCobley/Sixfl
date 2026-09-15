// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFixtureWinChanceBridge from "@/components/layout/PublicFixtureWinChanceBridge";
import PublicLeagueBadgeVisibilityBridge from "@/components/layout/PublicLeagueBadgeVisibilityBridge";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import PublicLeagueSeasonSwitcherBridge from "@/components/layout/PublicLeagueSeasonSwitcherBridge";
import RegisterInterestClarityBridge from "@/components/layout/RegisterInterestClarityBridge";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <PublicHeader />
      <PublicLeagueSeasonSwitcherBridge />
      <PublicLeagueLandingSpacingBridge />
      <PublicLeagueBadgeVisibilityBridge />
      <PublicFixtureWinChanceBridge />
      <Suspense fallback={null}>
        <RegisterInterestClarityBridge />
      </Suspense>
      <main className="bg-black">{children}</main>
      <SiteFooter />
    </div>
  );
}
