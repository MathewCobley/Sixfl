// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";
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
      <PlayerPreviewLinkPersistence teamId={teamid} />
      {children}
      <PlayerMessageBox teamId={teamid} />
    </>
  );
}
