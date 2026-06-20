// ========================================
// File: src/app/(admin)/admin/teams/[id]/captain-preview/exit/route.ts
// ========================================

import { NextResponse } from "next/server";

import { CAPTAIN_ONLY_PREVIEW_COOKIE } from "@/lib/requireCaptain";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

function getSafeRedirect(input: {
  origin: string;
  teamId: string;
  requestedTo: string | null;
}) {
  const fallback = `/captain/team/${input.teamId}`;
  const requestedTo = input.requestedTo?.trim();

  if (!requestedTo) {
    return new URL(fallback, input.origin);
  }

  try {
    const target = new URL(requestedTo, input.origin);
    const allowedPrefix = `/captain/team/${input.teamId}`;

    if (target.origin === input.origin && target.pathname.startsWith(allowedPrefix)) {
      target.searchParams.delete("captainPreview");
      return target;
    }
  } catch {
    // Fall through to the safe fallback.
  }

  return new URL(fallback, input.origin);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const url = new URL(request.url);
  const target = getSafeRedirect({
    origin: url.origin,
    teamId: id,
    requestedTo: url.searchParams.get("to"),
  });
  const response = NextResponse.redirect(target);

  response.cookies.set(CAPTAIN_ONLY_PREVIEW_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
