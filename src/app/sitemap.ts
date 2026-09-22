import { getNewsSitemap } from "@/lib/league-news/read";
// ========================================
// File: src/app/sitemap.ts
// ========================================

import type { MetadataRoute } from "next";

import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";
import { publicCanonicalUrl } from "@/lib/seo/public-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function absoluteUrl(path: string) {
  return publicCanonicalUrl(path.startsWith("/") ? path : `/${path}`);
}

function isRetiredHeartlandsLeague(slug: string) {
  return slug.toLowerCase().includes("heartlands");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentLeagueIds = await getCurrentLeagueIds();

  const leagues = currentLeagueIds.length
    ? await prisma.league.findMany({
        where: {
          id: {
            in: currentLeagueIds,
          },
          isActive: true,
          publicAt: { lte: new Date() },
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

  // No trustworthy edit timestamp is stored for these static pages. Omitting
  // lastModified is more accurate than marking them changed on every crawl.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/venues"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/harrogate-6-a-side-football"),
      changeFrequency: "weekly",
      priority: 0.92,
    },
    {
      url: absoluteUrl("/northallerton-6-a-side-football"),
      changeFrequency: "weekly",
      priority: 0.92,
    },
    {
      url: absoluteUrl("/wetherby-6-a-side-football"),
      changeFrequency: "weekly",
      priority: 0.92,
    },
    {
      url: absoluteUrl("/register-interest"),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: absoluteUrl("/bring-sixfl-to-your-area"),
      changeFrequency: "monthly",
      priority: 0.78,
    },
  ];

  const leagueRoutes: MetadataRoute.Sitemap = leagues
    .filter((league) => !isRetiredHeartlandsLeague(league.slug))
    .flatMap((league) => [
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

  const news = await getNewsSitemap();
  const newsRoutes: MetadataRoute.Sitemap = news.map(n => ({ url: absoluteUrl(n.path), lastModified: n.updatedAt, changeFrequency: "weekly", priority: 0.7 }));
  const archives: MetadataRoute.Sitemap = leagues.filter(l => !isRetiredHeartlandsLeague(l.slug)).map(l => ({ url: absoluteUrl(`/leagues/${l.slug}/news`), changeFrequency: "weekly", priority: 0.7 }));
  return [...staticRoutes, ...leagueRoutes, ...archives, ...newsRoutes];
}
