// ========================================
// File: src/app/api/auth/[...nextauth]/route.ts
// ========================================

import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/auth";
import { withTrackedSignInRequest } from "@/lib/auth/track-sign-in-request";

export const runtime = "nodejs";

const handler = NextAuth(authOptions);

type AuthRouteContext = { params: Promise<{ nextauth: string[] }> };

export { handler as GET };

export async function POST(request: NextRequest, context: AuthRouteContext) {
  return withTrackedSignInRequest(request, () => handler(request, context));
}
