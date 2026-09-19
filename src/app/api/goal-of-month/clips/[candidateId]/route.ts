import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { footageId, FootageError } from "@/lib/sixfl-tv/footage-policy";
import { streamFootage } from "@/lib/sixfl-tv/footage-stream";
import { createStoredVideoResponse } from "@/lib/storage/video-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ candidateId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { candidateId } = await context.params;
    const safeCandidateId = footageId(candidateId);
    const [row] = await prisma.$queryRaw<Array<{
      fixtureId: string;
      clipAssetId: string;
      mediaState: string;
      promoVideoObjectKey: string | null;
    }>>(Prisma.sql`
      SELECT c."fixtureId", c."clipAssetId", c."mediaState", c."promoVideoObjectKey"
      FROM "GoalOfMonthCandidate" c
      JOIN "Fixture" f ON f."id" = c."fixtureId"
      JOIN "SixflTvFootageAsset" a ON a."id" = c."clipAssetId"
      WHERE c."id" = ${safeCandidateId}
        AND c."status" = 'ACTIVE'
        AND c."clipAssetId" IS NOT NULL
        AND f."status"::text = 'COMPLETED'
        AND f."publishedAt" IS NOT NULL
        AND a."fixtureId" = c."fixtureId"
        AND a."kind" = 'CLIP'
        AND (
          a."state" = 'READY'
          OR (c."mediaState" = 'READY' AND c."promoVideoObjectKey" IS NOT NULL)
        )
      LIMIT 1
    `);
    if (!row) throw new FootageError("This nominated clip is unavailable.", 404);

    if (row.mediaState === "READY" && row.promoVideoObjectKey) {
      return createStoredVideoResponse({
        key: row.promoVideoObjectKey,
        range: request.headers.get("range"),
        filename: `sixfl-goal-of-the-month-${safeCandidateId}.mp4`,
        cacheControl: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      });
    }

    return await streamFootage(request, row.fixtureId, row.clipAssetId);
  } catch (error) {
    return new Response(error instanceof FootageError ? error.message : "This nominated clip is unavailable.", {
      status: error instanceof FootageError ? error.status : 503,
      headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  }
}

export const HEAD = GET;
