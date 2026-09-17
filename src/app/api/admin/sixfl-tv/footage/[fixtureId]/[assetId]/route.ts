import { requireAdmin } from "@/lib/requireAdmin";
import { footageId, FootageError } from "@/lib/sixfl-tv/footage-policy";
import { streamFootage } from "@/lib/sixfl-tv/footage-stream";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string; assetId: string }> };
export async function GET(request: Request, context: Context) {
  await requireAdmin();
  try {
    const params = await context.params;
    return await streamFootage(request, footageId(params.fixtureId), footageId(params.assetId));
  } catch (error) {
    return new Response(error instanceof FootageError ? error.message : "The private footage is unavailable.", {
      status: error instanceof FootageError ? error.status : 503,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
export const HEAD = GET;
