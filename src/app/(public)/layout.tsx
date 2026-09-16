// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/public-url";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFixtureWinChanceBridge from "@/components/layout/PublicFixtureWinChanceBridge";
import PublicLeagueBadgeVisibilityBridge from "@/components/layout/PublicLeagueBadgeVisibilityBridge";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import PublicLeagueSeasonSwitcherBridge from "@/components/layout/PublicLeagueSeasonSwitcherBridge";
import RegisterInterestClarityBridge from "@/components/layout/RegisterInterestClarityBridge";
import SiteFooter from "@/components/layout/SiteFooter";

// Only set the base here. A layout-wide canonical would incorrectly collapse
// unrelated pages onto one URL; each public page owns its canonical route.
export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
};

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
