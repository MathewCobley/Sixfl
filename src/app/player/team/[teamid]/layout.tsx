// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
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
      <PlayerPerformancePanel teamId={teamid} />
      <PlayerMessageBox teamId={teamid} />
    </>
  );
}
