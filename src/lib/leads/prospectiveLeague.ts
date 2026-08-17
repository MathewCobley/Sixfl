// ========================================
// File: src/lib/leads/prospectiveLeague.ts
// ========================================

import { InterestType, LeagueType, PreferredNight, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProspectiveLeagueMatchInput = {
  explicitLeagueId?: string | null;
  interestType: InterestType;
  leagueType?: LeagueType | null;
  area?: string | null;
  preferredNights?: PreferredNight[];
};

const AREA_FALLBACKS: Record<string, string[]> = {
  richmond: ["Catterick"],
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

function normaliseNights(values?: PreferredNight[]) {
  const nights = Array.from(new Set((values ?? []).filter(Boolean)));
  return nights.includes("ANY") ? [] : nights;
}

function getAreaSearchTerms(area: string) {
  if (!area) return [];

  const fallbackTerms = AREA_FALLBACKS[area.toLowerCase()] ?? [];
  return Array.from(new Set([area, ...fallbackTerms]));
}

export async function resolveProspectiveLeagueId(input: ProspectiveLeagueMatchInput) {
  const explicitLeagueId = clean(input.explicitLeagueId);

  if (explicitLeagueId) {
    const existing = await prisma.league.findUnique({
      where: { id: explicitLeagueId },
      select: {
        id: true,
        competition: {
          select: {
            currentLeagueId: true,
          },
        },
      },
    });

    return existing?.competition?.currentLeagueId ?? existing?.id ?? null;
  }

  if (input.interestType !== "TEAM" && input.interestType !== "PLAYER") {
    return null;
  }

  if (!input.leagueType) {
    return null;
  }

  const area = clean(input.area);
  const nights = normaliseNights(input.preferredNights);
  const sharedWhere: Prisma.LeagueWhereInput = {
    isActive: true,
    leagueType: input.leagueType,
    OR: [
      { competitionId: null },
      { currentForCompetitions: { some: { isActive: true } } },
    ],
    ...(nights.length > 0
      ? {
          dayOfWeek: {
            in: nights,
          },
        }
      : {}),
  };

  // Prefer an exact area match. This keeps the normal case deterministic when
  // the public form and league record use the same customer-facing area name.
  const exactMatches = await prisma.league.findMany({
    where: {
      ...sharedWhere,
      ...(area
        ? {
            area: {
              equals: area,
              mode: "insensitive" as const,
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

  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }

  if (!area) {
    return null;
  }

  // Marketing areas and operational league areas do not always use identical
  // wording (for example "Harrogate" on the website and "Harrogate West" on
  // the league). If the exact match failed, accept one unambiguous current
  // league whose area/name/slug/venue contains the requested area. Known
  // recruitment catchments such as Richmond -> Catterick are included here too.
  const areaSearchTerms = getAreaSearchTerms(area);
  const fuzzyMatches = await prisma.league.findMany({
    where: {
      ...sharedWhere,
      AND: [
        {
          OR: areaSearchTerms.flatMap((term) => [
            { area: { contains: term, mode: "insensitive" as const } },
            { name: { contains: term, mode: "insensitive" as const } },
            { slug: { contains: term, mode: "insensitive" as const } },
            { venueName: { contains: term, mode: "insensitive" as const } },
          ]),
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
    },
    take: 2,
  });

  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0].id;
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
