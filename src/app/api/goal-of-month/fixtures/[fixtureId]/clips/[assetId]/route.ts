import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { footageId, FootageError } from "@/lib/sixfl-tv/footage-policy";
import { streamFootage } from "@/lib/sixfl-tv/footage-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ fixtureId: string; assetId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const params = await context.params;
    const fixtureId = footageId(params.fixtureId);
    const assetId = footageId(params.assetId);
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "SixflTvFootageAsset" a
      JOIN "Fixture" f ON f."id" = a."fixtureId"
      WHERE a."id" = ${assetId}
        AND a."fixtureId" = ${fixtureId}
        AND a."kind" = 'CLIP'
        AND a."state" = 'READY'
        AND a."clipNumber" IS NOT NULL
        AND f."status"::text = 'COMPLETED'
        AND f."publishedAt" IS NOT NULL
      LIMIT 1
    `);
    if (!row) throw new FootageError("This clip is unavailable.", 404);
    return await streamFootage(request, fixtureId, assetId);
  } catch (error) {
    return new Response(error instanceof FootageError ? error.message : "This clip is unavailable.", {
      status: error instanceof FootageError ? error.status : 503,
      headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  }
}

export const HEAD = GET;
