import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPlayerPoolFollowupStates } from "@/lib/player-pool/followup-history";
import { safeFollowupSummary } from "@/lib/player-pool/followup-policy";
import { runPlayerPoolResponseChases } from "@/lib/player-pool/response-chases";
export const dynamic = "force-dynamic";
export async function GET() {
  await requireAdmin();
  const states = await getPlayerPoolFollowupStates();
  return NextResponse.json({ targets: states.map(s => safeFollowupSummary(s)) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const { user } = await requireAdmin();
  if (!user?.id) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const hosts = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
  let sameOrigin = false;
  try { const origin = new URL(request.headers.get("origin") || ""); sameOrigin = ["https:", "http:"].includes(origin.protocol) && hosts.includes(origin.host); } catch { /* Deny malformed origins. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site" || !request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Same-origin admin request required." }, { status: 403 });
  const text = await request.text();
  if (text.length > 64000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: { profileIds?: unknown; confirm?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body?.confirm !== true || !Array.isArray(body.profileIds) || body.profileIds.length > 500 || body.profileIds.some(id => typeof id !== "string" || !id || id.length > 100)) return NextResponse.json({ error: "Review and confirm at most 500 profile IDs." }, { status: 400 });
  const result = await runPlayerPoolResponseChases(body.profileIds as string[], user.id);
  revalidatePath("/admin/player-pool");
  revalidatePath("/admin/messaging");
  return NextResponse.json(result);
}
