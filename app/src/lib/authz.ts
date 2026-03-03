import { prisma } from "@/lib/prisma";

/**
 * Return which side the user is allowed to act as for this fixture (match).
 * In your schema: captain/manager == TeamMember.role === MANAGER
 */
export async function getUserSideForMatch(opts: {
  matchId: string; // this is Fixture.id in your schema
  userId: string;
}): Promise<"HOME" | "AWAY" | null> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: opts.matchId },
    select: { homeTeamId: true, awayTeamId: true },
  });

  if (!fixture) return null;

  const member = await prisma.teamMember.findFirst({
    where: {
      userId: opts.userId,
      role: "MANAGER",
      teamId: { in: [fixture.homeTeamId, fixture.awayTeamId] },
    },
    select: { teamId: true },
  });

  if (!member) return null;

  if (member.teamId === fixture.homeTeamId) return "HOME";
  if (member.teamId === fixture.awayTeamId) return "AWAY";
  return null;
}