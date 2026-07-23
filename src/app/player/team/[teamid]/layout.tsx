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
    <div className="player-team-layout min-h-screen bg-[#07130f]">
      <style>{`
        .player-team-layout > main {
          min-height: auto !important;
          padding-bottom: 1rem !important;
        }
      `}</style>
      <Suspense>
        <PlayerPreviewLinkPersistence teamId={teamid} />
      </Suspense>
      {children}
      <PlayerDashboardOnly teamId={teamid}>
        <div className="space-y-8 pb-8">
          <PlayerLeagueMediaPanel teamId={teamid} />
          <PlayerPerformancePanel teamId={teamid} />
          <PlayerMessageBox teamId={teamid} />
        </div>
      </PlayerDashboardOnly>
    </div>
  );
}
