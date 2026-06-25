// ========================================
// File: src/app/(admin)/admin/teams/[id]/captain-preview/route.ts
// ========================================

import { NextResponse } from "next/server";

import { CAPTAIN_ONLY_PREVIEW_COOKIE } from "@/lib/requireCaptain";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getPublicOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL;

  if (configuredOrigin) {
    return new URL(configuredOrigin).origin;
  }

  if (process.env.NODE_ENV === "production") {
    return "https://sixfl.co.uk";
  }

  return requestUrl.origin;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const origin = getPublicOrigin(request);

  const team = await prisma.team.findUnique({
    where: { id },
    select: { teamMode: true },
  });

  if (team?.teamMode === "MANAGED") {
    const adminTarget = new URL(`/admin/teams/${id}`, origin);
    const response = NextResponse.redirect(adminTarget);

    response.cookies.set(CAPTAIN_ONLY_PREVIEW_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  }

  const target = new URL(`/captain/team/${id}`, origin);
  const response = NextResponse.redirect(target);

  response.cookies.set(CAPTAIN_ONLY_PREVIEW_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });

  return response;
}
