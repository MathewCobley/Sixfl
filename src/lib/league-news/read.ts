import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { readNewsSnapshot } from './snapshot';
import { newsPath, type PublishedNews } from './types';

type PublicRow = { id: string; leagueSlug: string; publishedAt: Date; updatedAt: Date; snapshot: unknown };
const publicRow = (r: PublicRow): PublishedNews => ({ id: r.id, leagueSlug: r.leagueSlug, publishedAt: r.publishedAt.toISOString(), updatedAt: r.updatedAt.toISOString(), article: readNewsSnapshot(r.snapshot) });
// This module never reads draft/revision/settings tables or returns private source data.
export async function listPublishedNews(input: { leagueId?: string; teamId?: string; page?: number; limit?: number } = {}) {
  const limit = Math.min(12, Math.max(1, input.limit || 12));
  const page = Math.min(10000, Math.max(1, Math.floor(input.page || 1)));
  const rows = await prisma.$queryRaw<PublicRow[]>(Prisma.sql`
    SELECT n."id", l."slug" AS "leagueSlug", n."snapshot", n."publishedAt", n."publishedUpdatedAt" AS "updatedAt"
    FROM "LeagueNewsArticle" n JOIN "League" l ON l."id"=n."leagueId"
    WHERE n."status"='PUBLISHED' AND n."snapshot" IS NOT NULL
      ${input.leagueId ? Prisma.sql`AND n."leagueId"=${input.leagueId}` : Prisma.empty}
      ${input.teamId ? Prisma.sql`AND n."teamIds" @> ARRAY[${input.teamId}]::text[]` : Prisma.empty}
    ORDER BY n."matchDate" DESC, n."publishedAt" DESC, n."id" DESC
    LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}
  `);
  return { items: rows.slice(0, limit).map(publicRow), hasMore: rows.length > limit, page };
}
export async function getPublishedNews(slug: string, date: string): Promise<PublishedNews | null> {
  const rows = await prisma.$queryRaw<PublicRow[]>`
    SELECT n."id", l."slug" AS "leagueSlug", n."snapshot", n."publishedAt", n."publishedUpdatedAt" AS "updatedAt"
    FROM "LeagueNewsArticle" n JOIN "League" l ON l."id"=n."leagueId"
    WHERE l."slug"=${slug} AND n."matchDate"=${date} AND n."status"='PUBLISHED' AND n."snapshot" IS NOT NULL LIMIT 1
  `;
  return rows[0] ? publicRow(rows[0]) : null;
}
export async function getNewsSitemap() {
  const rows = await prisma.$queryRaw<Array<{ slug: string; matchDate: string; updatedAt: Date }>>`
    SELECT l."slug", n."matchDate", n."publishedUpdatedAt" AS "updatedAt" FROM "LeagueNewsArticle" n
    JOIN "League" l ON l."id"=n."leagueId" WHERE n."status"='PUBLISHED' AND n."snapshot" IS NOT NULL
    ORDER BY n."matchDate" DESC LIMIT 20000
  `;
  return rows.map(r => ({ path: newsPath(r.slug, r.matchDate), updatedAt: r.updatedAt }));
}
