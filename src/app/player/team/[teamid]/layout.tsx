// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
import PlayerDashboardOnly from "@/components/player/PlayerDashboardOnly";
import PlayerLeagueMediaPanel from "@/components/player/PlayerLeagueMediaPanel";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";
import PlayerPerformancePanel from "@/components/player/PlayerPerformancePanel";
import PlayerPreviewLinkPersistence from "@/components/player/PlayerPreviewLinkPersistence";

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
      <Suspense>
        <PlayerPreviewLinkPersistence teamId={teamid} />
      </Suspense>
      {children}
      <PlayerDashboardOnly teamId={teamid}>
        <PlayerLeagueMediaPanel teamId={teamid} />
      </PlayerDashboardOnly>
      <PlayerPerformancePanel teamId={teamid} />
      <PlayerMessageBox teamId={teamid} />
    </>
  );
}
