import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createGoalOfMonthNominationThumbnail } from "@/lib/sixfl-tv/graphics";
import { sixflTvGoalClipPosterKey } from "@/lib/sixfl-tv/goal-clip-poster";
import { fetchRailwayObject } from "@/lib/storage/railway-s3";
import { footageId } from "@/lib/sixfl-tv/footage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ candidateId: string }> };
type Row = {
  clipAssetId: string;
  clipNumber: number;
  scorerName: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string;
  leagueName: string;
};

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

export async function GET(request: Request, context: Context) {
  try {
    const { candidateId } = await context.params;
    const safeCandidateId = footageId(candidateId);
    const [row] = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        c."clipAssetId",
        a."clipNumber"::int AS "clipNumber",
        c."scorerName",
        team."name" AS "teamName",
        team."logoUrl" AS "teamLogoUrl",
        CASE WHEN f."homeTeamId" = c."teamId" THEN away."name" ELSE home."name" END AS "opponentName",
        league."name" AS "leagueName"
      FROM "GoalOfMonthCandidate" c
      JOIN "Fixture" f ON f."id" = c."fixtureId"
      JOIN "Team" team ON team."id" = c."teamId"
      JOIN "Team" home ON home."id" = f."homeTeamId"
      JOIN "Team" away ON away."id" = f."awayTeamId"
      JOIN "League" league ON league."id" = f."leagueId"
      JOIN "SixflTvFootageAsset" a ON a."id" = c."clipAssetId" AND a."fixtureId" = c."fixtureId"
      WHERE c."id" = ${safeCandidateId}
        AND c."status" = 'ACTIVE'
        AND c."clipAssetId" IS NOT NULL
        AND a."kind" = 'CLIP'
        AND a."clipNumber" IS NOT NULL
        AND f."status"::text = 'COMPLETED'
        AND f."publishedAt" IS NOT NULL
      LIMIT 1
    `);
    if (!row) return new Response("Thumbnail unavailable.", { status: 404 });

    let backgroundImage: Buffer | null = null;
    try {
      const response = await fetchRailwayObject({
        key: sixflTvGoalClipPosterKey(row.clipAssetId),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length && bytes.length <= 8 * 1024 * 1024) backgroundImage = bytes;
      } else {
        await response.body?.cancel().catch(() => undefined);
      }
    } catch {
      // A branded fallback is valid until this clip has been through a highlights render.
    }

    const png = await createGoalOfMonthNominationThumbnail({
      siteUrl: siteUrl(request),
      clipNumber: Number(row.clipNumber),
      scorerName: row.scorerName,
      teamName: row.teamName,
      teamLogoUrl: row.teamLogoUrl,
      opponentName: row.opponentName,
      leagueName: row.leagueName,
      backgroundImage,
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": backgroundImage
          ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60"
          : "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Goal of the Month thumbnail failed", error);
    return new Response("Thumbnail unavailable.", { status: 503 });
  }
}
