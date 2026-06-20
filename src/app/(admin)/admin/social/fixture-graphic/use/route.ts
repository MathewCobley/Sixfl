// ========================================
// File: src/app/(admin)/admin/social/fixture-graphic/use/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getBaseUrl } from "@/lib/social/weekly-match-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedBackgrounds = new Set(["emerald", "night", "slate", "spotlight"]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normaliseBackground(value: string) {
  return allowedBackgrounds.has(value) ? value : "emerald";
}

function normaliseOrigin(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (host && !host.startsWith("localhost:") && !host.startsWith("127.0.0.1")) {
    return `${forwardedProto}://${host}`;
  }

  return (
    normaliseOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normaliseOrigin(process.env.NEXTAUTH_URL) ||
    normaliseOrigin(process.env.APP_URL) ||
    normaliseOrigin(process.env.BASE_URL) ||
    normaliseOrigin(getBaseUrl()) ||
    "https://sixfl.co.uk"
  );
}

function redirectToSocial(request: Request, status: string) {
  return NextResponse.redirect(`${getRequestOrigin(request)}/admin/social?fixtureGraphic=${status}`, 303);
}

export async function POST(request: Request) {
  await requireAdmin();

  const formData = await request.formData();
  const cardId = getString(formData, "cardId");
  const background = normaliseBackground(getString(formData, "background"));

  if (!cardId) {
    return redirectToSocial(request, "missing-card");
  }

  const imageUrl = `${getRequestOrigin(request)}/api/social/match-card/${cardId}?background=${encodeURIComponent(background)}`;

  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "imageUrl" = ${imageUrl},
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;

  return redirectToSocial(request, "selected");
}
