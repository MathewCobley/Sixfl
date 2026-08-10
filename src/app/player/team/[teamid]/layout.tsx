// ========================================
// File: src/app/player/team/[teamid]/layout.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { Suspense, type ReactNode } from "react";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import GoalOfWeekDashboardPromo from "@/components/goal-of-week/GoalOfWeekDashboardPromo";
import PlayerDashboardOnly from "@/components/player/PlayerDashboardOnly";
import PlayerLeagueMediaPanel from "@/components/player/PlayerLeagueMediaPanel";
import PlayerMessageBox from "@/components/player/PlayerMessageBox";
import PlayerTeamNav from "@/components/player/PlayerTeamNav";
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

  const viewer = email
    ? await prisma.user.findUnique({
        where: { email },
        select: {
          role: true,
          teamMembers: {
            where: {
              teamId: teamid,
              role: "CAPTAIN",
            },
            select: { id: true },
            take: 1,
          },
        },
      })
    : null;

  const isAdmin = viewer?.role === UserRole.ADMIN;
  const isCaptain = Boolean(viewer?.teamMembers.length);
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

      {returnHref ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200/80">
                {isAdmin ? "Admin player view" : "Player view"}
              </div>
              <div className="mt-1 text-sm text-white/65">
                You can return to the team management area at any time.
              </div>
            </div>
            <Link
              href={returnHref}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-violet-200 px-4 text-sm font-bold text-violet-950 transition hover:bg-white"
            >
              ← {returnLabel}
            </Link>
          </div>
        </div>
      ) : null}

      <Suspense>
        <PlayerTeamNav teamId={teamid} />
      </Suspense>

      <PlayerDashboardOnly teamId={teamid}>
        <div className="mx-auto w-full max-w-6xl px-4 pt-6">
          <GoalOfWeekDashboardPromo
            teamId={teamid}
            href={`/goal-of-the-week?from=player&teamId=${encodeURIComponent(teamid)}`}
          />
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
