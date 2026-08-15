import type { ReactNode } from "react";

import LeagueQuickLinks from "@/components/leagues/LeagueQuickLinks";
import { prisma } from "@/lib/prisma";

export default async function PublicTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
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

  const leagueSlug = team?.league?.competition?.currentLeague?.slug ?? team?.league?.slug ?? null;

  return (
    <>
      {leagueSlug ? (
        <LeagueQuickLinks
          slug={leagueSlug}
          contextHref={`/teams/${id}`}
          contextLabel="Team page"
        />
      ) : null}
      {children}
    </>
  );
}
