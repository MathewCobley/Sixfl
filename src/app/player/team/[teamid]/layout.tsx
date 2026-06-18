// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import PlayerDashboardCopyPolish from "@/components/player/PlayerDashboardCopyPolish";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";

export default async function PlayerTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;

  return (
    <>
      <PlayerDashboardCopyPolish />
      {children}
      <PlayerMessageBox teamId={teamid} />
    </>
  );
}
