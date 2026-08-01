import { prisma } from "@/lib/prisma";

export type PlayerTeamMembershipSummary = {
  membershipId: string;
  userId: string;
  teamId: string;
  teamName: string;
  role: string;
  leagueName: string | null;
  leagueSeason: string | null;
};

export async function getPlayerTeamMembershipsByUserId(
  userIds: string[],
): Promise<Map<string, PlayerTeamMembershipSummary[]>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map<string, PlayerTeamMembershipSummary[]>();
  }

  const memberships = await prisma.teamMember.findMany({
    where: {
      userId: { in: uniqueUserIds },
    },
    orderBy: [
      { team: { name: "asc" } },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      userId: true,
      teamId: true,
      role: true,
      team: {
        select: {
          name: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  const result = new Map<string, PlayerTeamMembershipSummary[]>();

  for (const membership of memberships) {
    const rows = result.get(membership.userId) ?? [];
    rows.push({
      membershipId: membership.id,
      userId: membership.userId,
      teamId: membership.teamId,
      teamName: membership.team.name,
      role: membership.role,
      leagueName: membership.team.league?.name ?? null,
      leagueSeason: membership.team.league?.season ?? null,
    });
    result.set(membership.userId, rows);
  }

  return result;
}
