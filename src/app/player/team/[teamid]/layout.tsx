// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
import GoalOfWeekDashboardPromo from "@/components/goal-of-week/GoalOfWeekDashboardPromo";
import PlayerDashboardOnly from "@/components/player/PlayerDashboardOnly";
import PlayerLeagueMediaPanel from "@/components/player/PlayerLeagueMediaPanel";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";
import PlayerPreviewLinkPersistence from "@/components/player/PlayerPreviewLinkPersistence";
import PlayerTeamNav from "@/components/player/PlayerTeamNav";
import PlayerTemporaryMatchFeesPanel from "@/components/player/PlayerTemporaryMatchFeesPanel";

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
      <PlayerTeamNav teamId={teamid} />
      <PlayerDashboardOnly teamId={teamid}>
        <div className="mx-auto w-full max-w-6xl px-4 pt-6">
          <GoalOfWeekDashboardPromo
            teamId={teamid}
            href={`/player/team/${teamid}/tv`}
          />
          <PlayerTemporaryMatchFeesPanel />
        </div>
      </PlayerDashboardOnly>
      {children}
      <PlayerDashboardOnly teamId={teamid}>
        <div className="space-y-8 pb-8">
          <PlayerLeagueMediaPanel teamId={teamid} />
          <PlayerMessageBox teamId={teamid} />
        </div>
      </PlayerDashboardOnly>
    </div>
  );
}
