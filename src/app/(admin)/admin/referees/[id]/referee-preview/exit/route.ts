// ========================================
// File: src/app/(admin)/admin/referees/[id]/referee-preview/exit/route.ts
// ========================================

import { NextResponse } from "next/server";

import { REFEREE_PREVIEW_COOKIE } from "@/lib/admin";
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

function getSafeRedirect(input: {
  origin: string;
  refereeId: string;
  requestedTo: string | null;
}) {
  const fallback = `/admin/referees/${input.refereeId}`;
  const requestedTo = input.requestedTo?.trim();

  if (!requestedTo) {
    return new URL(fallback, input.origin);
  }

  try {
    const target = new URL(requestedTo, input.origin);
    const allowedPrefixes = [
      `/admin/referees/${input.refereeId}`,
      "/admin/referees",
      "/admin/referee-nights",
    ];

    if (target.origin === input.origin && allowedPrefixes.some((prefix) => target.pathname.startsWith(prefix))) {
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
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(
    getSafeRedirect({
      origin: getPublicOrigin(request),
      refereeId: id,
      requestedTo: requestUrl.searchParams.get("to"),
    }),
  );

  response.cookies.set(REFEREE_PREVIEW_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
