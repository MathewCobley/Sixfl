import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createStoredVideoResponse } from "@/lib/storage/video-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeagueVideoRow = {
  advertVideoKey: string | null;
  advertVideoFilename: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const rows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT "advertVideoKey", "advertVideoFilename"
    FROM "League"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  const league = rows[0] ?? null;

  if (!league?.advertVideoKey) {
    return new Response("Video not found.", { status: 404 });
  }

  return createStoredVideoResponse({
    key: league.advertVideoKey,
    filename: league.advertVideoFilename,
    range: request.headers.get("range"),
    cacheControl: "private, no-store, max-age=0",
  });
}
