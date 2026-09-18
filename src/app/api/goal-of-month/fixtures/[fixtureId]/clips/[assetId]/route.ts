import { getFixtureGoalClip } from "@/lib/goal-of-month/clips";
import { streamFootage } from "@/lib/sixfl-tv/footage-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ fixtureId: string; assetId: string }> };

export async function GET(request: Request, context: Context) {
  const { fixtureId, assetId } = await context.params;
  const clip = await getFixtureGoalClip(fixtureId, assetId);
  if (!clip) {
    return new Response("Goal clip not available.", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  }
  return streamFootage(request, clip.fixtureId, clip.assetId);
}

export const HEAD = GET;
