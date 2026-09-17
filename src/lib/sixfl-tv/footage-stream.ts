import { fetchRailwayObject } from "@/lib/storage/railway-s3";
import { footageAsset, footageParts } from "./footage";
import { FOOTAGE_PART_BYTES, FootageError } from "./footage-policy";

export function footageRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new FootageError("Unsupported byte range.", 416);
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new FootageError("Unsupported byte range.", 416);
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new FootageError("Unsupported byte range.", 416);
  return { start, end, partial: true };
}

/** Admin auth belongs to the route. No public URLs or storage credentials escape. */
export async function streamFootage(request: Request, fixtureId: string | null, assetId: string) {
  const asset = await footageAsset(fixtureId, assetId);
  if (asset.state !== "READY") throw new FootageError("This footage has not finished uploading.", 409);
  const size = Number(asset.sizeBytes);
  let range: ReturnType<typeof footageRange>;
  try { range = footageRange(request.headers.get("range"), size); }
  catch (error) {
    if (error instanceof FootageError && error.status === 416) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" } });
    throw error;
  }
  const allParts = await footageParts(assetId);
  if (allParts.length !== asset.partCount || allParts.some((p, i) => p.partNumber !== i || !p.stored)) throw new FootageError("This footage is being removed or is incomplete.", 409);
  const parts = allParts.filter(p => p.partNumber * FOOTAGE_PART_BYTES <= range.end && p.partNumber * FOOTAGE_PART_BYTES + p.sizeBytes > range.start);
  const headers = new Headers({
    "Content-Type": "video/mp4", "Content-Length": String(range.end - range.start + 1),
    "Accept-Ranges": "bytes", "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="sixfl-footage.mp4"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
  });
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  if (request.method === "HEAD") return new Response(null, { status: range.partial ? 206 : 200, headers });
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null, index = 0;
  let expectedBytes = 0, receivedBytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          if (!reader) {
            if (index >= parts.length) { controller.close(); return; }
            const part = parts[index];
            const base = part.partNumber * FOOTAGE_PART_BYTES;
            const start = Math.max(0, range.start - base), end = Math.min(part.sizeBytes - 1, range.end - base);
            expectedBytes = end - start + 1; receivedBytes = 0;
            const partialPart = start !== 0 || end !== part.sizeBytes - 1;
            const response = await fetchRailwayObject({ key: part.objectKey,
              range: partialPart ? `bytes=${start}-${end}` : null,
              signal: AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(30000)]) });
            if (!response.ok || !response.body || (partialPart && response.status !== 206)) {
              await response.body?.cancel(); throw new Error("Stored footage part is unavailable.");
            }
            reader = response.body.getReader();
          }
          const chunk = await reader.read();
          if (chunk.done) {
            reader.releaseLock(); reader = null; index++;
            if (receivedBytes !== expectedBytes) throw new Error("Stored footage part is incomplete.");
            continue;
          }
          receivedBytes += chunk.value.byteLength;
          if (receivedBytes > expectedBytes) throw new Error("Stored footage part has an unexpected length.");
          controller.enqueue(chunk.value); return;
        }
      } catch {
        abort.abort();
        await reader?.cancel().catch(() => undefined);
        controller.error(new Error("Footage could not be read. Reload the preview."));
      }
    },
    async cancel() { abort.abort(); await reader?.cancel().catch(() => undefined); },
  });
  return new Response(stream, { status: range.partial ? 206 : 200, headers });
}
