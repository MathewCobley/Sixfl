// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/layout.tsx
// ========================================

import type { ReactNode } from "react";

import PlayerDashboardLoginEmailButtons from "@/components/captain/PlayerDashboardLoginEmailButtons";

export default function CaptainSquadLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PlayerDashboardLoginEmailButtons />
      {children}
    </>
  );
}
