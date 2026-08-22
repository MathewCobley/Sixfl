import { InterestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TeamEmailRegistrationConflict =
  | { kind: "same-team" }
  | { kind: "email-in-use" };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTeamName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Public team registration rule:
 * - the same email + same team is a duplicate submission;
 * - the same email + a different team is blocked from self-service registration.
 *
 * Admin can still deal with genuine multi-team managers manually. Player
 * membership is deliberately not checked here: the same person may play for
 * more than one team, but one captain/contact email should not silently create
 * multiple team identities.
 */
export async function findTeamEmailRegistrationConflict(input: {
  email: string;
  teamName?: string | null;
}): Promise<TeamEmailRegistrationConflict | null> {
  const email = normalizeEmail(input.email);
  if (!email) return null;

  const incomingTeamName = normalizeTeamName(input.teamName);

  const [existingLeads, existingTeams] = await Promise.all([
    prisma.interestLead.findMany({
      where: {
        interestType: InterestType.TEAM,
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        teamName: true,
      },
      take: 25,
    }),
    prisma.team.findMany({
      where: {
        OR: [
          {
            contactEmail: {
              equals: email,
              mode: "insensitive",
            },
          },
          {
            members: {
              some: {
                role: "CAPTAIN",
                user: {
                  email: {
                    equals: email,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
      },
      take: 25,
    }),
  ]);

  if (incomingTeamName) {
    const sameLead = existingLeads.some(
      (lead) => normalizeTeamName(lead.teamName) === incomingTeamName,
    );
    const sameTeam = existingTeams.some(
      (team) => normalizeTeamName(team.name) === incomingTeamName,
    );

    if (sameLead || sameTeam) {
      return { kind: "same-team" };
    }
  }

  if (existingLeads.length > 0 || existingTeams.length > 0) {
    return { kind: "email-in-use" };
  }

  return null;
}

export function buildTeamEmailConflictPath(
  conflict: TeamEmailRegistrationConflict,
) {
  return `/register-team/already-registered?reason=${encodeURIComponent(conflict.kind)}`;
}
