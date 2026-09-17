import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchRailwayObject } from "@/lib/storage/railway-s3";
import { FOOTAGE_PART_BYTES } from "./footage-policy";
import { StudioError, type SixflTvRenderKind } from "./studio";

type Job = { id: string; fixtureId: string; kind: SixflTvRenderKind; state: string; outputSizeBytes: bigint | null; partCount: number | null };
type Part = { jobId: string; partNumber: number; objectKey: string; sizeBytes: number; stored: boolean };

export function renderRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new StudioError("Unsupported byte range.", 416);
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new StudioError("Unsupported byte range.", 416);
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new StudioError("Unsupported byte range.", 416);
  return { start, end, partial: true };
}

export async function streamRenderedVideo(request: Request, fixtureId: string, jobId: string) {
  const rows = await prisma.$queryRaw<Job[]>(Prisma.sql`SELECT "id","fixtureId","kind","state","outputSizeBytes","partCount" FROM "SixflTvRenderJob" WHERE "id"=${jobId} AND "fixtureId"=${fixtureId}`);
  const job = rows[0];
  if (!job) throw new StudioError("Rendered video not found.", 404);
  if (job.state !== "READY" || job.outputSizeBytes == null || job.partCount == null) throw new StudioError("This rendered video is not ready yet.", 409);
  const size = Number(job.outputSizeBytes);
  let range: ReturnType<typeof renderRange>;
  try { range = renderRange(request.headers.get("range"), size); }
  catch (error) {
    if (error instanceof StudioError && error.status === 416) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" } });
    throw error;
  }
  const all = await prisma.$queryRaw<Part[]>`SELECT * FROM "SixflTvRenderPart" WHERE "jobId"=${jobId} ORDER BY "partNumber"`;
  if (all.length !== job.partCount || all.some((part, i) => part.partNumber !== i || !part.stored)) throw new StudioError("Rendered video storage is incomplete.", 503);
  const parts = all.filter(part => part.partNumber * FOOTAGE_PART_BYTES <= range.end && part.partNumber * FOOTAGE_PART_BYTES + part.sizeBytes > range.start);
  const filename = job.kind === "HIGHLIGHTS" ? "sixfl-highlights.mp4" : "sixfl-full-match.mp4";
  const headers = new Headers({
    "Content-Type": "video/mp4", "Content-Length": String(range.end - range.start + 1), "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"`,
  });
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  if (request.method === "HEAD") return new Response(null, { status: range.partial ? 206 : 200, headers });
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null, index = 0, expected = 0, received = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          if (!reader) {
            if (index >= parts.length) { controller.close(); return; }
            const part = parts[index], base = part.partNumber * FOOTAGE_PART_BYTES;
            const start = Math.max(0, range.start - base), end = Math.min(part.sizeBytes - 1, range.end - base);
            expected = end - start + 1; received = 0;
            const partial = start !== 0 || end !== part.sizeBytes - 1;
            const response = await fetchRailwayObject({ key: part.objectKey, range: partial ? `bytes=${start}-${end}` : null,
              signal: AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(30000)]) });
            if (!response.ok || !response.body || (partial && response.status !== 206)) { await response.body?.cancel(); throw new Error("Stored render part unavailable"); }
            reader = response.body.getReader();
          }
          const chunk = await reader.read();
          if (chunk.done) {
            reader.releaseLock(); reader = null; index++;
            if (received !== expected) throw new Error("Stored render part incomplete");
            continue;
          }
          received += chunk.value.byteLength;
          if (received > expected) throw new Error("Stored render part length mismatch");
          controller.enqueue(chunk.value); return;
        }
      } catch {
        abort.abort(); await reader?.cancel().catch(() => undefined); controller.error(new Error("Rendered video could not be read."));
      }
    },
    async cancel() { abort.abort(); await reader?.cancel().catch(() => undefined); },
  });
  return new Response(stream, { status: range.partial ? 206 : 200, headers });
}
