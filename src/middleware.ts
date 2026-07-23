// ========================================
// File: src/middleware.ts
// ========================================

import { NextResponse, type NextRequest } from "next/server";

const WHATSAPP_LOGO_ALIASES = new Set([
  "/WhatsApp-Logo.png",
  "/WhatsApp-logo.png",
  "/whatsapp-logo.png",
]);

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (WHATSAPP_LOGO_ALIASES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/whats-app-logo.png";
    return NextResponse.rewrite(url);
  }

  if (pathname === "/register-interest") {
    const redirect = preserveRegisterInterestContext(request);
    if (redirect) return redirect;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/register-interest",
    "/WhatsApp-Logo.png",
    "/WhatsApp-logo.png",
    "/whatsapp-logo.png",
  ],
};
