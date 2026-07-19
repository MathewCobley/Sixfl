import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normaliseTeamKitColour } from "@/lib/teams/kit-colour-values";

type TeamKitColourRow = {
  id: string;
  kitPrimaryColour: string | null;
};

export async function getTeamKitColour(teamId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<TeamKitColourRow[]>`
    SELECT "id", "kitPrimaryColour"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `;

  return normaliseTeamKitColour(rows[0]?.kitPrimaryColour);
}

export async function getTeamKitColours(
  teamIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
  const colours = new Map<string, string | null>();

  for (const teamId of uniqueIds) colours.set(teamId, null);
  if (uniqueIds.length === 0) return colours;

  const rows = await prisma.$queryRaw<TeamKitColourRow[]>(
    Prisma.sql`
      SELECT "id", "kitPrimaryColour"
      FROM "Team"
      WHERE "id" IN (${Prisma.join(uniqueIds)})
    `,
  );

  for (const row of rows) {
    colours.set(row.id, normaliseTeamKitColour(row.kitPrimaryColour));
  }

  return colours;
}
