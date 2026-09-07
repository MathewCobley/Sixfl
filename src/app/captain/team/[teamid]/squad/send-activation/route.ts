// ========================================
// File: src/app/captain/team/[teamid]/squad/send-activation/route.ts
// ========================================

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireCaptain } from "@/lib/requireCaptain";
import { queuePendingSquadActivationEmail } from "@/lib/squad/activation-emails";

function getSiteUrl() {
  const fallback = "https://www.sixfl.co.uk";
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    fallback;

  return value.replace(/\/+$/, "");
}

function getPublicRequestOrigin(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim() ||
    "";
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.trim() || "https";

  if (
    forwardedHost &&
    !forwardedHost.includes("localhost") &&
    !forwardedHost.includes("127.0.0.1")
  ) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return getSiteUrl();
}

function getSquadRedirectUrl(request: NextRequest, teamid: string, query: string) {
  return new URL(
    `/captain/team/${teamid}/squad${query}`,
    getPublicRequestOrigin(request),
  );
}

function getCaptainSquadRedirectUrl(request: NextRequest, teamid: string, query: string) {
  return new URL(
    `/captain/team/${teamid}/captain-squad${query}`,
    getPublicRequestOrigin(request),
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  const formData = await request.formData();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const access = await requireCaptain(teamid);
  const { user } = access;

  if (!access.isAdmin) {
    return NextResponse.redirect(
      getCaptainSquadRedirectUrl(
        request,
        teamid,
        "?error=Only%20SIXFL%20admin%20can%20send%20activation%20emails.",
      ),
    );
  }

  if (!teamid || !prospectId) {
    return NextResponse.redirect(
      getSquadRedirectUrl(
        request,
        teamid,
        "?error=Missing%20prospect%20details.",
      ),
    );
  }

  let result;
  try {
    result = await queuePendingSquadActivationEmail({
      prospectId, teamId: teamid,
      mode: formData.get("resend") === "1" ? "resend" : "initial",
      createdByUserId: user?.id ?? null,
    });
  } catch (error) {
    console.error("Squad activation could not be queued", { prospectId, error });
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid,
      "?error=Activation%20could%20not%20be%20queued.%20Check%20Prospect%20comms%20and%20System%20Templates."));
  }
  if (!result.queued) {
    return NextResponse.redirect(getSquadRedirectUrl(request, teamid, `?error=${encodeURIComponent(result.reason)}`));
  }

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/captain/team/${teamid}/prospects`);
  revalidatePath(`/admin/teams/${teamid}/prospects/${prospectId}/communications`);
  revalidatePath("/admin/messaging");

  return NextResponse.redirect(
    getSquadRedirectUrl(request, teamid, "?saved=activation-email-sent"),
  );
}
