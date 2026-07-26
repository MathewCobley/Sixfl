import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import LeagueAdvertVideoManager from "@/components/admin/leagues/LeagueAdvertVideoManager";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeagueVideoRow = {
  id: string;
  name: string;
  advertVideoKey: string | null;
  advertVideoFilename: string | null;
  advertVideoSizeBytes: number | null;
  advertVideoEnabled: boolean;
  advertVideoUploadedAt: Date | null;
};

export default async function LeagueAdvertVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const rows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT
      "id",
      "name",
      "advertVideoKey",
      "advertVideoFilename",
      "advertVideoSizeBytes"::int AS "advertVideoSizeBytes",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled",
      "advertVideoUploadedAt"
    FROM "League"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  const league = rows[0] ?? null;

  if (!league) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl">
      <LeagueAdvertVideoManager
        leagueId={league.id}
        leagueName={league.name}
        initialVideo={{
          hasVideo: Boolean(league.advertVideoKey),
          filename: league.advertVideoFilename,
          sizeBytes: league.advertVideoSizeBytes,
          enabled: league.advertVideoEnabled,
          uploadedAt: league.advertVideoUploadedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
