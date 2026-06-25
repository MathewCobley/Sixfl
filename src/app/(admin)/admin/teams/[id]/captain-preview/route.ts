// ========================================
// File: src/app/(admin)/admin/teams/[id]/captain-preview/route.ts
// ========================================

import { NextResponse } from "next/server";

import { CAPTAIN_ONLY_PREVIEW_COOKIE } from "@/lib/requireCaptain";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isLocalHost(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
}

function getNonLocalOrigin(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (isLocalHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getPublicOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const refererOrigin = getNonLocalOrigin(request.headers.get("referer"));
  const requestOrigin = getNonLocalOrigin(request.headers.get("origin"));

  if (refererOrigin) return refererOrigin;
  if (requestOrigin) return requestOrigin;

  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL;

  const configuredPublicOrigin = getNonLocalOrigin(configuredOrigin);
  if (configuredPublicOrigin) return configuredPublicOrigin;

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
