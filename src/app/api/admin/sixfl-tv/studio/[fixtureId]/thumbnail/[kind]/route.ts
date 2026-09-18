import { requireAdmin } from "@/lib/requireAdmin";
import { footageId } from "@/lib/sixfl-tv/footage-policy";
import { StudioError, thumbnailPreviewResponse, thumbnailResponse, type SixflTvRenderKind } from "@/lib/sixfl-tv/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string; kind: string }> };
export async function GET(request: Request, context: Context) {
  await requireAdmin();
  try {
    const { fixtureId, kind } = await context.params;
    if (kind !== "HIGHLIGHTS" && kind !== "FULL_MATCH") throw new StudioError("Thumbnail not found.", 404);
    const safeFixtureId = footageId(fixtureId), safeKind = kind as SixflTvRenderKind;
    const url = new URL(request.url);
    if (url.searchParams.get("preview") === "1") {
      return await thumbnailPreviewResponse(safeFixtureId, safeKind, {
        headline: url.searchParams.get("headline") || "",
        strapline: url.searchParams.get("strapline") || "",
        showScore: url.searchParams.get("showScore") ?? "true",
      });
    }
    return await thumbnailResponse(request, safeFixtureId, safeKind);
  } catch (error) {
    if (error instanceof StudioError) return new Response(error.message, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("SIXFL TV thumbnail stream failed", error instanceof Error ? error.name : "Unknown error");
    return new Response("Thumbnail is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
