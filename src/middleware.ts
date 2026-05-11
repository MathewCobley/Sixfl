// ========================================
// File: src/middleware.ts
// ========================================

import { NextResponse, type NextRequest } from "next/server";

const WHATSAPP_LOGO_ALIASES = new Set([
  "/WhatsApp-Logo.png",
  "/WhatsApp-logo.png",
  "/whatsapp-logo.png",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (WHATSAPP_LOGO_ALIASES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/whats-app-logo.png";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/WhatsApp-Logo.png", "/WhatsApp-logo.png", "/whatsapp-logo.png"],
};
