import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function PlayerLeagueResultsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/league-results`)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user || (user.role !== UserRole.ADMIN && user.teamMembers.length === 0)) {
    notFound();
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      league: {
        select: {
          slug: true,
          competition: {
            select: {
              currentLeague: {
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const leagueSlug =
    team.league?.competition?.currentLeague?.slug ?? team.league?.slug ?? null;

  if (!leagueSlug) {
    redirect(`/player/team/${teamid}`);
  }

  redirect(`/leagues/${leagueSlug}/results`);
}
