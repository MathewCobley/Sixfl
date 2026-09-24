// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import { getServerSession } from "next-auth";
import { Suspense, type ReactNode } from "react";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import MandatoryAgreementGate from "@/components/agreements/MandatoryAgreementGate";
import GoalOfWeekDashboardPromo from "@/components/goal-of-week/GoalOfWeekDashboardPromo";
import PlayerDashboardOnly from "@/components/player/PlayerDashboardOnly";
import PlayerLeagueMediaPanel from "@/components/player/PlayerLeagueMediaPanel";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";
import PlayerPreviewReturnBanner from "@/components/player/PlayerPreviewReturnBanner";
import PlayerPwaPortalHeader from "@/components/player/PlayerPwaPortalHeader";
import PlayerPwaModeOnly from "@/components/player/PlayerPwaModeOnly";
import PlayerTeamNav from "@/components/player/PlayerTeamNav";
import { hasAcceptedCurrentAgreement } from "@/lib/agreements";
import { prisma } from "@/lib/prisma";

export default async function PlayerTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions).catch(() => null);
  const email = session?.user?.email?.trim().toLowerCase() ?? null;

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      name: true,
      logoUrl: true,
    },
  });

  const viewer = email
    ? await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          role: true,
          teamMembers: {
            where: {
              teamId: teamid,
            },
            select: { id: true, role: true },
          },
        },
      })
    : null;

  const isAdmin = viewer?.role === UserRole.ADMIN;
  const isCaptain = Boolean(
    viewer?.teamMembers.some((membership) => membership.role === "CAPTAIN"),
  );
  const hasTeamMembership = Boolean(viewer?.teamMembers.length);

  if (
    viewer?.id &&
    !isAdmin &&
    hasTeamMembership &&
    !(await hasAcceptedCurrentAgreement(viewer.id, "PLAYER"))
  ) {
    return (
      <MandatoryAgreementGate
        agreementType="PLAYER"
        name={viewer.name}
      />
    );
  }
  const returnHref = isAdmin
    ? `/admin/teams/${teamid}`
    : isCaptain
      ? `/captain/team/${teamid}`
      : null;
  const returnLabel = isAdmin ? "Return to admin team" : "Return to captain dashboard";

  return (
    <div className="player-team-layout min-h-screen bg-[#07130f]">
      <style>{`
        .player-team-layout > main {
          min-height: auto !important;
          padding-bottom: 1rem !important;
        }
      `}</style>

      {team ? (
        <Suspense fallback={null}>
          <PlayerPwaPortalHeader
            teamName={team.name}
            teamLogoUrl={team.logoUrl}
          />
        </Suspense>
      ) : null}

      {returnHref ? (
        <PlayerPwaModeOnly mode="web">
          <PlayerPreviewReturnBanner
            returnHref={returnHref}
            returnLabel={returnLabel}
            isAdmin={isAdmin}
          />
        </PlayerPwaModeOnly>
      ) : null}

      <Suspense>
        <PlayerTeamNav teamId={teamid} showTeamChat={isAdmin} />
      </Suspense>

      {/* Keep the player's dashboard first; discovery panels belong to the full website only. */}
      {children}
      <PlayerPwaModeOnly mode="web">
        <div className="player-web-discovery">
          <PlayerDashboardOnly teamId={teamid}>
            <div className="mx-auto w-full max-w-6xl px-4 pt-6">
              <GoalOfWeekDashboardPromo
                teamId={teamid}
                href={`/goal-of-the-week?from=player&teamId=${encodeURIComponent(teamid)}`}
              />
            </div>
          </PlayerDashboardOnly>
          <PlayerDashboardOnly teamId={teamid}>
            <div className="space-y-8 pb-8">
              <PlayerLeagueMediaPanel teamId={teamid} />
              <PlayerMessageBox teamId={teamid} />
            </div>
          </PlayerDashboardOnly>
        </div>
      </PlayerPwaModeOnly>
    </div>
  );
}
