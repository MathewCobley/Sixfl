import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { footageId, FootageError } from "@/lib/sixfl-tv/footage-policy";
import { streamFootage } from "@/lib/sixfl-tv/footage-stream";
import { fetchRailwayObject } from "@/lib/storage/railway-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ candidateId: string }> };
type RenderRow = { objectKey: string; sizeBytes: bigint };

function rangeFor(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new FootageError("Unsupported byte range.", 416);
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new FootageError("Unsupported byte range.", 416);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new FootageError("Unsupported byte range.", 416);
  }
  return { start, end, partial: true };
}

async function streamBrandedNominee(request: Request, row: RenderRow) {
  const size = Number(row.sizeBytes);
  const range = rangeFor(request.headers.get("range"), size);
  const objectRange = range.partial ? `bytes=${range.start}-${range.end}` : null;
  const response = await fetchRailwayObject({
    key: row.objectKey,
    range: objectRange,
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok || !response.body || (range.partial && response.status !== 206)) {
    await response.body?.cancel().catch(() => undefined);
    throw new FootageError("This nominated clip is temporarily unavailable.", 503);
  }
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Length": String(range.end - range.start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Disposition": 'inline; filename="sixfl-goal-of-the-month-nominee.mp4"',
  });
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  if (request.method === "HEAD") {
    await response.body.cancel().catch(() => undefined);
    return new Response(null, { status: range.partial ? 206 : 200, headers });
  }
  return new Response(response.body, { status: range.partial ? 206 : 200, headers });
}

export async function GET(request: Request, context: Context) {
  try {
    const { candidateId } = await context.params;
    const safeCandidateId = footageId(candidateId);
    const [row] = await prisma.$queryRaw<Array<{ fixtureId: string; clipAssetId: string }>>(Prisma.sql`
      SELECT c."fixtureId", c."clipAssetId"
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
        AND a."state" = 'READY'
      LIMIT 1
    `);
    if (!row) throw new FootageError("This nominated clip is unavailable.", 404);
    const rendered = await prisma.$queryRaw<RenderRow[]>(Prisma.sql`
      SELECT r."objectKey", r."sizeBytes"
      FROM "GoalOfMonthClipRender" r
      WHERE r."candidateId"=${safeCandidateId}
        AND r."state"='READY'
        AND r."objectKey" IS NOT NULL
        AND r."sizeBytes" IS NOT NULL
      LIMIT 1
    `);
    if (rendered[0]) return await streamBrandedNominee(request, rendered[0]);
    return await streamFootage(request, row.fixtureId, row.clipAssetId);
  } catch (error) {
    return new Response(error instanceof FootageError ? error.message : "This nominated clip is unavailable.", {
      status: error instanceof FootageError ? error.status : 503,
      headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  }
}

export const HEAD = GET;
