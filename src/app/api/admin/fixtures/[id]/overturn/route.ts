import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { previewResultOverturn, confirmResultOverturn, ResultOverturnError } from "@/lib/results/overturn-result";

export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origins = [new URL(request.url).origin];
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    try { if (value) origins.push(new URL(value).origin); } catch { /* Invalid optional origin is not trusted. */ }
  }
  if (!origins.includes(request.headers.get("origin") ?? "") || request.headers.get("sec-fetch-site") === "cross-site" ||
    !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Same-origin JSON request required." }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const actor = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } }) : null;
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { id: fixtureId } = await params;
  try {
    const raw = await request.text();
    if (raw.length > 24000) throw new ResultOverturnError("Request too large.");
    let body;
    try { body = JSON.parse(raw); } catch { throw new ResultOverturnError("Invalid JSON request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ResultOverturnError("Invalid request.");
    if (body.action === "preview") {
      const preview = await previewResultOverturn({ fixtureId, actorUserId: actor.id,
        winnerTeamId: body.winnerTeamId, reasonCode: body.reasonCode, decisionReason: body.decisionReason,
        evidenceReference: body.evidenceReference, rulesBasis: body.rulesBasis });
      return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "confirm") throw new ResultOverturnError("Choose preview or confirm.");
    const result = await confirmResultOverturn({ fixtureId, actorUserId: actor.id, token: body.token, confirmed: body.confirmed === true });
    // Save is authoritative. Cache invalidation is retriable; never imply a
    // database rollback after the decision was already committed.
    try {
      revalidatePath("/", "layout");
      revalidatePath(`/leagues/${result.leagueSlug}`);
      revalidatePath(`/admin/fixtures/${fixtureId}/overturn`);
    } catch (error) { console.error("[result-overturn] Saved; cache refresh failed", { fixtureId, error }); }
    return NextResponse.json({ ...result, saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ResultOverturnError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[result-overturn] Request failed", error);
    return NextResponse.json({ error: "Unable to complete the request. Check the decision page before retrying. No payment or message was requested." }, { status: 500 });
  }
}
