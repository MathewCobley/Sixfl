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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const rows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT
      "advertVideoKey",
      "advertVideoFilename",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled"
    FROM "League"
    WHERE "slug" = ${slug}
      AND "isActive" = true
    LIMIT 1
  `);
  const league = rows[0] ?? null;

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
