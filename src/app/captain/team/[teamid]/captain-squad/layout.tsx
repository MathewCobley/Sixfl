// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/layout.tsx
// ========================================

import type { ReactNode } from "react";

import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
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
      {/* The app owns its forms and pending states. Legacy website injection
          must not add a second login action or checkbox to those forms. */}
      <CaptainPwaModeOnly mode="web">
        {!access.isAdmin ? <PlayerDashboardLoginEmailButtons /> : null}
      </CaptainPwaModeOnly>
      {children}
    </>
  );
}
