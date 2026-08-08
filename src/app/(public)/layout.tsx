// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
import AppHeader from "@/components/layout/AppHeader";
import PublicFixtureWinChanceBridge from "@/components/layout/PublicFixtureWinChanceBridge";
import PublicLeagueBadgeVisibilityBridge from "@/components/layout/PublicLeagueBadgeVisibilityBridge";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import PublicLeagueSeasonSwitcherBridge from "@/components/layout/PublicLeagueSeasonSwitcherBridge";
import RegisterInterestClarityBridge from "@/components/layout/RegisterInterestClarityBridge";
import RefereeDashboardCopyBridge from "@/components/referee/RefereeDashboardCopyBridge";
import RefereeNightPickerBridge from "@/components/referee/RefereeNightPickerBridge";
import RefereeOnsiteColleaguesBridge from "@/components/referee/RefereeOnsiteColleaguesBridge";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <AppHeader variant="public" />
      <PublicLeagueSeasonSwitcherBridge />
      <PublicLeagueLandingSpacingBridge />
      <PublicLeagueBadgeVisibilityBridge />
      <PublicFixtureWinChanceBridge />
      <RefereeDashboardCopyBridge />
      <RefereeNightPickerBridge />
      <RefereeOnsiteColleaguesBridge />
      <Suspense fallback={null}>
        <RegisterInterestClarityBridge />
      </Suspense>
      <main className="bg-black">{children}</main>
      <SiteFooter />
    </div>
  );
}
