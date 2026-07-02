// ========================================
// File: src/app/sitemap.ts
// ========================================

import type { MetadataRoute } from "next";

import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.sixfl.co.uk";

function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const currentLeagueIds = await getCurrentLeagueIds();

  const leagues = currentLeagueIds.length
    ? await prisma.league.findMany({
        where: {
          id: {
            in: currentLeagueIds,
          },
        },
        select: {
          slug: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      })
    : [];

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/register-interest"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];

  const leagueRoutes: MetadataRoute.Sitemap = leagues.flatMap((league) => [
    {
      url: absoluteUrl(`/leagues/${league.slug}`),
      lastModified: league.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.95,
    },
    {
      url: absoluteUrl(`/leagues/${league.slug}/fixtures`),
      lastModified: league.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    {
      url: absoluteUrl(`/leagues/${league.slug}/stats`),
      lastModified: league.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
  ]);

  return [...staticRoutes, ...leagueRoutes];
}
