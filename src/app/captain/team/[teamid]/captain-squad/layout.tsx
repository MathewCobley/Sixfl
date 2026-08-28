// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/layout.tsx
// ========================================

import type { ReactNode } from "react";

import PlayerDashboardLoginEmailButtons from "@/components/captain/PlayerDashboardLoginEmailButtons";
import { requireCaptain } from "@/lib/requireCaptain";

export default async function CaptainSquadLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  return (
    <>
      {!access.isAdmin ? <PlayerDashboardLoginEmailButtons /> : null}
      {children}
    </>
  );
}
