// ========================================
// File: src/components/captain/CaptainCurrentLeagueTableBridge.tsx
// ========================================

"use client";

import CaptainOutstandingBalanceBridge from "@/components/captain/CaptainOutstandingBalanceBridge";
import CaptainStoredPredictionBridge from "@/components/captain/CaptainStoredPredictionBridge";

export default function CaptainCurrentLeagueTableBridge() {
  return (
    <>
      <CaptainOutstandingBalanceBridge />
      <CaptainStoredPredictionBridge />
    </>
  );
}
