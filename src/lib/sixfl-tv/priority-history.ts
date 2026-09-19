import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { toLondonDateInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { getSixflTvPriorityScores } from "@/lib/sixfl-tv/priority-score";
import { readVeoTeams } from "@/lib/veo/service";

export type PriorityWeeklySnapshotRow = {
  weekStart: string | Date;
  leagueId: string;
  leagueName: string;
  teamId: string;
  teamName: string;
  score: number;
  qualifies: boolean;
  provisional: boolean;
  matchesCount: number;
  coreCompletedMatches: number;
};

export function priorityWeekStart(now = new Date()) {
  const londonDate = toLondonDateInputValue(now);
  const [year, month, day] = londonDate.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const daysSinceMonday = (noonUtc.getUTCDay() + 6) % 7;
  noonUtc.setUTCDate(noonUtc.getUTCDate() - daysSinceMonday);
  return noonUtc.toISOString().slice(0, 10);
}

export async function capturePriorityWeeklySnapshot(now = new Date()) {
  const weekStart = priorityWeekStart(now);
  const leagues = await prisma.league.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { season: "asc" }],
    select: { id: true, name: true, season: true },
  });

  const leagueTeams = await Promise.all(
    leagues.map(async (league) => ({
      league,
      teams: await readVeoTeams(league.id),
    })),
  );
  const teamIds = [...new Set(leagueTeams.flatMap((entry) => entry.teams.map((team) => team.id)))];
  const scores = await getSixflTvPriorityScores(teamIds, prisma, now);

  const rows = leagueTeams.flatMap(({ league, teams }) => {
    const leagueName = [league.name, league.season].filter(Boolean).join(" · ");
    return teams.flatMap((team) => {
      const score = scores.get(team.id);
      if (!score) return [];
      return [{
        id: randomUUID(),
        weekStart,
        leagueId: league.id,
        leagueName,
        teamId: team.id,
        teamName: team.name,
        score: score.score,
        qualifies: score.qualifies,
        provisional: score.provisional,
        matchesCount: score.matchesCount,
        coreCompletedMatches: score.coreCompletedMatches,
      }];
    });
  });

  if (!rows.length) return { weekStart, created: 0, teams: 0 };

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424425)::text`;
    let inserted = 0;
    for (const row of rows) {
      inserted += await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SixflTvPriorityWeeklySnapshot" (
          "id","weekStart","leagueId","leagueName","teamId","teamName",
          "score","qualifies","provisional","matchesCount","coreCompletedMatches"
        )
        VALUES (
          ${row.id},${row.weekStart}::date,${row.leagueId},${row.leagueName},${row.teamId},${row.teamName},
          ${row.score},${row.qualifies},${row.provisional},${row.matchesCount},${row.coreCompletedMatches}
        )
        ON CONFLICT ("weekStart","leagueId","teamId") DO NOTHING
      `);
    }
    return inserted;
  });

  return { weekStart, created, teams: rows.length };
}

export async function readPriorityWeeklyHistory() {
  return prisma.$queryRaw<PriorityWeeklySnapshotRow[]>(Prisma.sql`
    SELECT
      "weekStart"::text AS "weekStart",
      "leagueId",
      "leagueName",
      "teamId",
      "teamName",
      "score",
      "qualifies",
      "provisional",
      "matchesCount",
      "coreCompletedMatches"
    FROM "SixflTvPriorityWeeklySnapshot"
    ORDER BY "leagueName","weekStart","teamName","teamId"
  `);
}
