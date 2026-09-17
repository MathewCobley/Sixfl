import { requireAdmin } from "@/lib/requireAdmin";
import { footageId } from "@/lib/sixfl-tv/footage-policy";
import { StudioError, thumbnailResponse, type SixflTvRenderKind } from "@/lib/sixfl-tv/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string; kind: string }> };
export async function GET(request: Request, context: Context) {
  await requireAdmin();
  try {
    const { fixtureId, kind } = await context.params;
    if (kind !== "HIGHLIGHTS" && kind !== "FULL_MATCH") throw new StudioError("Thumbnail not found.", 404);
    return await thumbnailResponse(request, footageId(fixtureId), kind as SixflTvRenderKind);
  } catch (error) {
    if (error instanceof StudioError) return new Response(error.message, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("SIXFL TV thumbnail stream failed", error instanceof Error ? error.name : "Unknown error");
    return new Response("Thumbnail is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
