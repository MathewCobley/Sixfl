import { prisma } from "@/lib/prisma";

export type SameLeagueRegistrationConflict = {
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string | null;
  season: string | null;
};

export async function findSameLeagueRegistrationConflict(input: {
  userId: string;
  targetTeamId: string;
}): Promise<SameLeagueRegistrationConflict | null> {
  const targetTeam = await prisma.team.findUnique({
    where: { id: input.targetTeamId },
    select: {
      id: true,
      leagueId: true,
      league: { select: { id: true, name: true, season: true } },
    },
  });

  if (!targetTeam?.leagueId) return null;

  const existing = await prisma.teamMember.findFirst({
    where: {
      userId: input.userId,
      teamId: { not: input.targetTeamId },
      team: { leagueId: targetTeam.leagueId },
      user: { emailVerified: { not: null } },
    },
    select: {
      team: {
        select: {
          id: true,
          name: true,
          leagueId: true,
          league: { select: { name: true, season: true } },
        },
      },
    },
  });

  if (!existing?.team.leagueId) return null;

  return {
    teamId: existing.team.id,
    teamName: existing.team.name,
    leagueId: existing.team.leagueId,
    leagueName: existing.team.league?.name ?? targetTeam.league?.name ?? null,
    season: existing.team.league?.season ?? targetTeam.league?.season ?? null,
  };
}

export function sameLeagueRegistrationMessage(conflict: SameLeagueRegistrationConflict) {
  const competition = [conflict.leagueName, conflict.season].filter(Boolean).join(" · ");
  return `This player is already permanently registered to ${conflict.teamName}${competition ? ` in ${competition}` : " in this league"}. A player can only be permanently registered to one team in the same SIXFL league/season. If they are needed for another team, they must be used as a SIXFL-approved guest for that fixture instead.`;
}
