import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createStoredVideoResponse } from "@/lib/storage/video-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeagueVideoRow = {
  advertVideoKey: string | null;
  advertVideoFilename: string | null;
  advertVideoEnabled: boolean;
};

async function findLeagueVideo(slug: string) {
  const exactRows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT
      "advertVideoKey",
      "advertVideoFilename",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled"
    FROM "League"
    WHERE "slug" = ${slug}
      AND "isActive" = true
    LIMIT 1
  `);

  if (exactRows[0] || slug.toLowerCase() !== "heartlands") {
    return exactRows[0] ?? null;
  }

  const aliasRows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT
      "advertVideoKey",
      "advertVideoFilename",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled"
    FROM "League"
    WHERE "isActive" = true
      AND (
        LOWER("slug") LIKE '%heartlands%'
        OR LOWER("name") LIKE '%heartlands%'
        OR LOWER(COALESCE("area", '')) LIKE '%heartlands%'
      )
    ORDER BY "createdAt" DESC
    LIMIT 1
  `);

  return aliasRows[0] ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const league = await findLeagueVideo(slug);

  if (!league?.advertVideoKey || !league.advertVideoEnabled) {
    return new Response("Video not found.", { status: 404 });
  }

  return createStoredVideoResponse({
    key: league.advertVideoKey,
    filename: league.advertVideoFilename,
    range: request.headers.get("range"),
    cacheControl: "public, max-age=300, stale-while-revalidate=600",
  });
}
