// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { redirect } from "next/navigation";

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

  if (access.isAdmin) {
    redirect(`/admin/teams/${teamid}/captain-preview`);
  }

  return (
    <>
      <PlayerDashboardLoginEmailButtons />
      {children}
    </>
  );
}
