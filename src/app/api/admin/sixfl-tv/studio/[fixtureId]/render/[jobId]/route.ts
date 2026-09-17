import { requireAdmin } from "@/lib/requireAdmin";
import { footageId } from "@/lib/sixfl-tv/footage-policy";
import { streamRenderedVideo } from "@/lib/sixfl-tv/render-stream";
import { StudioError } from "@/lib/sixfl-tv/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string; jobId: string }> };
async function handler(request: Request, context: Context) {
  await requireAdmin();
  try {
    const { fixtureId, jobId } = await context.params;
    return await streamRenderedVideo(request, footageId(fixtureId), footageId(jobId));
  } catch (error) {
    if (error instanceof StudioError) return new Response(error.message, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    console.error("SIXFL TV render stream failed", error instanceof Error ? error.name : "Unknown error");
    return new Response("Rendered video is temporarily unavailable.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
export const GET = handler;
export const HEAD = handler;
