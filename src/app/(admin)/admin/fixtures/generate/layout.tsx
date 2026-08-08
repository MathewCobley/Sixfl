import { Prisma } from "@prisma/client";
import type { ReactNode } from "react";

import CreateSingleFixturePanel from "@/components/admin/fixtures/CreateSingleFixturePanel";
import AdminFixtureUnavailabilitySummary from "@/components/admin/fixtures/AdminFixtureUnavailabilitySummary";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { getAllLeagueDivisionOptions } from "@/lib/league-divisions";
import { prisma } from "@/lib/prisma";

type TeamOptionRow = {
  id: string;
  name: string;
  leagueId: string;
  divisionId: string | null;
};

function leagueLabel(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

function refereeLabel(referee: { name: string | null; email: string | null }) {
  if (referee.name && referee.email) return `${referee.name} • ${referee.email}`;
  return referee.name || referee.email || "Unnamed referee";
}

export default async function AdminFixtureGeneratorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentLeagueIds = await getCurrentLeagueIds();

  const [leagues, divisions, teams, venues, referees] = await Promise.all([
    currentLeagueIds.length
      ? prisma.league.findMany({
          where: { id: { in: currentLeagueIds } },
          orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
          select: { id: true, name: true, season: true },
        })
      : Promise.resolve([]),
    getAllLeagueDivisionOptions(),
    currentLeagueIds.length
      ? prisma.$queryRaw<TeamOptionRow[]>(Prisma.sql`
          SELECT
            t."id",
            t."name",
            lst."leagueId",
            lst."divisionId"
          FROM "LeagueSeasonTeam" lst
          JOIN "Team" t ON t."id" = lst."teamId"
          WHERE lst."leagueId" IN (${Prisma.join(currentLeagueIds)})
            AND lst."isActive" = TRUE
            AND t."leagueId" = lst."leagueId"
          ORDER BY t."name" ASC
        `)
      : Promise.resolve([]),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["REFEREE", "ADMIN"] } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const currentLeagueIdSet = new Set(currentLeagueIds);
  const currentDivisions = divisions.filter((division) =>
    currentLeagueIdSet.has(division.leagueId),
  );

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
        <AdminFixtureUnavailabilitySummary />

        <div className="mt-6 rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-6 md:p-8">
          <CreateSingleFixturePanel
            leagues={leagues.map((league) => ({
              id: league.id,
              label: leagueLabel(league),
            }))}
            divisions={currentDivisions.map((division) => ({
              id: division.id,
              leagueId: division.leagueId,
              name: division.name,
            }))}
            teams={teams}
            venues={venues}
            referees={referees.map((referee) => ({
              id: referee.id,
              label: refereeLabel(referee),
            }))}
          />
        </div>
      </div>
      {children}
    </>
  );
}
