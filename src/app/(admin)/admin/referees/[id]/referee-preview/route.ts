// ========================================
// File: src/app/(admin)/admin/referees/[id]/referee-preview/route.ts
// ========================================

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { REFEREE_PREVIEW_COOKIE } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

function getSafePreviewTarget(request: Request) {
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("to")?.trim();

  if (!target) return "/referee";

  try {
    const parsed = new URL(target, requestUrl.origin);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (path === "/referee" || path.startsWith("/referee/")) {
      return path;
    }
  } catch {
    // Ignore invalid target and use the referee dashboard.
  }

  return "/referee";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const origin = getPublicOrigin(request);
  const previewTarget = getSafePreviewTarget(request);

  const referee = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    return NextResponse.redirect(new URL("/admin/referees", origin));
  }

  const response = NextResponse.redirect(new URL(previewTarget, origin));

  response.cookies.set(REFEREE_PREVIEW_COOKIE, referee.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });

  return response;
}
