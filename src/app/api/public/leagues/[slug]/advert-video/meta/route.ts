import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeagueVideoMetaRow = {
  id: string;
  name: string;
  slug: string;
  advertVideoKey: string | null;
  advertVideoFilename: string | null;
  advertVideoEnabled: boolean;
  advertVideoUploadedAt: Date | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const rows = await prisma.$queryRaw<LeagueVideoMetaRow[]>(Prisma.sql`
    SELECT
      "id",
      "name",
      "slug",
      "advertVideoKey",
      "advertVideoFilename",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled",
      "advertVideoUploadedAt"
    FROM "League"
    WHERE "slug" = ${slug}
      AND "isActive" = true
    LIMIT 1
  `);
  const league = rows[0] ?? null;

  if (!league) {
    return NextResponse.json({ hasVideo: false }, { status: 404 });
  }

  return NextResponse.json({
    leagueId: league.id,
    leagueName: league.name,
    leagueSlug: league.slug,
    hasVideo: Boolean(league.advertVideoKey && league.advertVideoEnabled),
    filename: league.advertVideoFilename,
    uploadedAt: league.advertVideoUploadedAt?.toISOString() ?? null,
  });
}
