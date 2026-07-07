// ========================================
// File: src/components/captain/CaptainCurrentLeagueTableBridge.tsx
// ========================================

"use client";

import CaptainDashboardFixturesBridge from "@/components/captain/CaptainDashboardFixturesBridge";
import CaptainOutstandingBalanceBridge from "@/components/captain/CaptainOutstandingBalanceBridge";

export default function CaptainCurrentLeagueTableBridge() {
  return (
    <>
      <CaptainDashboardFixturesBridge />
      <CaptainOutstandingBalanceBridge />
    </>
  );
}
