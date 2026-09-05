import { getTeamBadgeImage } from "@/lib/team-badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public images, like the existing public/team-logos files; writes remain admin-only. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const thumbnail = new URL(request.url).searchParams.get("variant") === "thumbnail";
  const data = await getTeamBadgeImage(id, thumbnail);
  if (!data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const etag = `"${id}-${thumbnail ? "thumbnail" : "full"}"`;
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(data), { headers });
}
