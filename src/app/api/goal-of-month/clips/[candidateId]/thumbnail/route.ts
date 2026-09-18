import { getCandidateGoalClip, goalClipThumbnail } from "@/lib/goal-of-month/clips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ candidateId: string }> };

export async function GET(_request: Request, context: Context) {
  const { candidateId } = await context.params;
  const clip = await getCandidateGoalClip(candidateId);
  if (!clip) return new Response("Goal thumbnail not found.", { status: 404 });

  const bytes = await goalClipThumbnail(clip);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
