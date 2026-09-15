import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { FreeKitOfferError, getTeamFreeKitOffer, setTeamFreeKitOffer, type TeamFreeKitOffer } from "@/lib/kits/free-kit-offer";
import { requireAdmin } from "@/lib/requireAdmin";

const noStore = { "Cache-Control": "no-store" };
function payload(row: TeamFreeKitOffer) {
  return { teamId: row.teamId, teamName: row.teamName, wantsFreeKit: row.wantsFreeKit,
    leadWantsFreeKit: row.leadWantsFreeKit, enabled: row.enabled, includedEligible: row.includedEligible,
    expired: Boolean(row.expiredAt), expiredAt: row.expiredAt, reason: row.reason,
    hasExistingOrder: row.hasExistingOrder, hasKitCharges: row.hasKitCharges, revision: row.revision };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  await requireAdmin();
  const { teamId } = await params;
  const row = await getTeamFreeKitOffer(teamId);
  return row ? NextResponse.json(payload(row), { headers: noStore })
    : NextResponse.json({ error: "Team not found" }, { status: 404, headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { user } = await requireAdmin();
  if (!user?.id) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 403, headers: noStore });
  const { teamId } = await params;
  const origin = request.headers.get("origin");
  const allowed = [new URL(request.url).origin];
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (value) { try { allowed.push(new URL(value).origin); } catch { /* Invalid optional setting. */ } }
  }
  if (!origin || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Open Team settings on the SIXFL website before saving." }, { status: 403, headers: noStore });
  }
  const body = await request.json().catch(() => null) as { expired?: unknown; reason?: unknown; revision?: unknown } | null;
  if (typeof body?.expired !== "boolean" || typeof body.revision !== "string") {
    return NextResponse.json({ error: "Reload the current offer and choose a valid setting." }, { status: 400, headers: noStore });
  }
  try {
    const result = await setTeamFreeKitOffer({ teamId, enabled: !body.expired, actorUserId: user.id,
      expectedRevision: body.revision, reason: typeof body.reason === "string" ? body.reason : "" });
    revalidatePath("/admin/teams", "layout");
    revalidatePath("/admin/kits");
    revalidatePath(`/captain/team/${teamId}`, "layout");
    return NextResponse.json(payload(result.state), { headers: noStore });
  } catch (error) {
    if (error instanceof FreeKitOfferError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    console.error("Free kit offer update failed", error);
    return NextResponse.json({ error: "The offer could not be saved. Reload before trying again." }, { status: 500, headers: noStore });
  }
}
