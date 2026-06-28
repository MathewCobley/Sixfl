// ========================================
// File: src/lib/leads/prospectiveLeague.ts
// ========================================

import { InterestType, LeagueType, PreferredNight } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProspectiveLeagueMatchInput = {
  explicitLeagueId?: string | null;
  interestType: InterestType;
  leagueType?: LeagueType | null;
  area?: string | null;
  preferredNights?: PreferredNight[];
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

function normaliseNights(values?: PreferredNight[]) {
  const nights = Array.from(new Set((values ?? []).filter(Boolean)));
  return nights.includes("ANY") ? [] : nights;
}

export async function resolveProspectiveLeagueId(input: ProspectiveLeagueMatchInput) {
  const explicitLeagueId = clean(input.explicitLeagueId);

  if (explicitLeagueId) {
    const existing = await prisma.league.findUnique({
      where: { id: explicitLeagueId },
      select: { id: true },
    });

    return existing?.id ?? null;
  }

  if (input.interestType !== "TEAM" && input.interestType !== "PLAYER") {
    return null;
  }

  if (!input.leagueType) {
    return null;
  }

  const area = clean(input.area);
  const nights = normaliseNights(input.preferredNights);

  const matches = await prisma.league.findMany({
    where: {
      isActive: true,
      leagueType: input.leagueType,
      ...(area
        ? {
            area: {
              equals: area,
              mode: "insensitive",
            },
          }
        : {}),
      ...(nights.length > 0
        ? {
            dayOfWeek: {
              in: nights,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
    },
    take: 2,
  });

  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

export function formatProspectiveLeagueLabel(input: {
  name: string;
  season: string | null;
  area: string | null;
  dayOfWeek: PreferredNight | null;
  venueName: string | null;
}) {
  const parts = [
    input.name,
    input.season,
    input.area,
    input.dayOfWeek ? input.dayOfWeek.charAt(0) + input.dayOfWeek.slice(1).toLowerCase() : null,
    input.venueName,
  ].filter(Boolean);

  return parts.join(" • ");
}
