import { fetchRailwayObject } from "@/lib/storage/railway-s3";

const FORWARDED_VIDEO_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

export async function createStoredVideoResponse(input: {
  key: string;
  range?: string | null;
  filename?: string | null;
  cacheControl?: string;
}) {
  const storageResponse = await fetchRailwayObject({
    key: input.key,
    range: input.range,
  });

  if (!storageResponse.ok && storageResponse.status !== 206) {
    console.error("Stored video could not be read", {
      key: input.key,
      status: storageResponse.status,
    });

    return new Response("Video not available.", { status: 502 });
  }

  const headers = new Headers();

  for (const name of FORWARDED_VIDEO_HEADERS) {
    const value = storageResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  headers.set("accept-ranges", headers.get("accept-ranges") || "bytes");
  headers.set("content-type", headers.get("content-type") || "video/mp4");
  headers.set(
    "cache-control",
    input.cacheControl || "private, no-store, max-age=0",
  );

  if (input.filename) {
    const safeFilename = input.filename.replace(/[\r\n"]/g, "");
    headers.set("content-disposition", `inline; filename="${safeFilename}"`);
  }

  return new Response(storageResponse.body, {
    status: storageResponse.status,
    headers,
  });
}
