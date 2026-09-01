// ========================================
// File: src/middleware.ts
// ========================================

import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "sixfl.co.uk";
const LEGACY_WWW_HOST = "www.sixfl.co.uk";

const WHATSAPP_LOGO_ALIASES = new Set([
  "/WhatsApp-Logo.png",
  "/WhatsApp-logo.png",
  "/whatsapp-logo.png",
]);

function getRequestHostname(request: NextRequest) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host =
    forwardedHost || request.headers.get("host") || request.nextUrl.hostname;

  return host.toLowerCase().replace(/:\d+$/, "");
}

function redirectToCanonicalHost(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  // Cron calls carry an Authorization header. A www -> apex redirect changes
  // origin and Node fetch may drop that sensitive header, producing a false 401.
  // Never redirect protected cron routes; let the endpoint authenticate the
  // original request directly.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return null;
  }

  if (getRequestHostname(request) !== LEGACY_WWW_HOST) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";

  return NextResponse.redirect(url, 308);
}

function preserveRegisterInterestContext(request: NextRequest) {
  const currentUrl = request.nextUrl;
  const needsArea = !currentUrl.searchParams.get("area");
  const needsNight = !currentUrl.searchParams.get("night");

  if (!needsArea && !needsNight) {
    return null;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  let previousUrl: URL;

  try {
    previousUrl = new URL(referer);
  } catch {
    return null;
  }

  if (
    previousUrl.origin !== currentUrl.origin ||
    previousUrl.pathname !== "/register-interest"
  ) {
    return null;
  }

  const area = previousUrl.searchParams.get("area")?.trim();
  const night = previousUrl.searchParams.get("night")?.trim();

  if ((!needsArea || !area) && (!needsNight || !night)) {
    return null;
  }

  const redirectUrl = currentUrl.clone();

  if (needsArea && area) {
    redirectUrl.searchParams.set("area", area);
  }

  if (needsNight && night) {
    redirectUrl.searchParams.set("night", night);
  }

  return NextResponse.redirect(redirectUrl);
}

function isHarrogateTuesdaySignup(request: NextRequest) {
  const area = request.nextUrl.searchParams.get("area")?.trim().toLowerCase();
  const night = request.nextUrl.searchParams.get("night")?.trim().toLowerCase();

  return area === "harrogate" && night === "tuesday";
}

export function middleware(request: NextRequest) {
  const canonicalRedirect = redirectToCanonicalHost(request);
  if (canonicalRedirect) return canonicalRedirect;

  const { pathname } = request.nextUrl;

  if (WHATSAPP_LOGO_ALIASES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/whats-app-logo.png";
    return NextResponse.rewrite(url);
  }

  if (pathname === "/register-interest") {
    const redirect = preserveRegisterInterestContext(request);
    if (redirect) return redirect;

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      isHarrogateTuesdaySignup(request)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/register-interest/harrogate";
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
