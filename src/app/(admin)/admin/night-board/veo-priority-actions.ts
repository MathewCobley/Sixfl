'use server';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';

type NightBoardVeoPriorityRow = {
  fixtureId: string;
  teamId: string;
  teamName: string;
  homeName: string;
  awayName: string;
  kickoffAt: Date;
  choice: string | null;
};

export type NightBoardVeoPriorityItem = {
  fixtureId: string;
  teamId: string;
  teamName: string;
  homeName: string;
  awayName: string;
  kickoffAt: string;
  choice: string | null;
};

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function loadNightBoardVeoPriorities(input: {
  date: string;
  leagueId?: string;
  venueId?: string;
}): Promise<NightBoardVeoPriorityItem[]> {
  await requireAdmin();

  if (!validDate(input.date)) return [];

  const leagueId = input.leagueId?.trim() ?? '';
  const venueId = input.venueId?.trim() ?? '';

  const rows = await prisma.$queryRaw<NightBoardVeoPriorityRow[]>(Prisma.sql`
    SELECT
      r."fixtureId",
      r."teamId",
      t.name AS "teamName",
      h.name AS "homeName",
      a.name AS "awayName",
      f."kickoffAt",
      r.choice::text AS choice
    FROM "VeoFixtureRequest" r
    JOIN "Fixture" f ON f.id = r."fixtureId"
    JOIN "Team" t ON t.id = r."teamId"
    JOIN "Team" h ON h.id = f."homeTeamId"
    JOIN "Team" a ON a.id = f."awayTeamId"
    WHERE r.status::text = 'REQUESTED'
      AND f."publishedAt" IS NOT NULL
      AND f.status::text IN ('SCHEDULED', 'COMPLETED')
      AND to_char(
        f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London',
        'YYYY-MM-DD'
      ) = ${input.date}
      ${leagueId ? Prisma.sql`AND f."leagueId" = ${leagueId}` : Prisma.empty}
      ${venueId ? Prisma.sql`AND f."venueId" = ${venueId}` : Prisma.empty}
    ORDER BY f."kickoffAt", f.pitch, f.position, t.name
  `);

  return rows.map((row) => ({
    fixtureId: row.fixtureId,
    teamId: row.teamId,
    teamName: row.teamName,
    homeName: row.homeName,
    awayName: row.awayName,
    kickoffAt: row.kickoffAt.toISOString(),
    choice: row.choice,
  }));
}
