// ========================================
// File: src/app/api/social/ai-image/[cardId]/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GeneratedImageRow = {
  mimeType: string;
  imageBase64: string;
  updatedAt: Date;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;

  const rows = await prisma.$queryRaw<GeneratedImageRow[]>`
    SELECT "mimeType", "imageBase64", "updatedAt"
    FROM "SocialGeneratedImage"
    WHERE "socialMatchCardId" = ${cardId}
    LIMIT 1
  `;

  const image = rows[0] ?? null;

  if (!image) {
    return new NextResponse("Generated image not found.", { status: 404 });
  }

  const buffer = Buffer.from(image.imageBase64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": image.mimeType || "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Last-Modified": image.updatedAt.toUTCString(),
    },
  });
}
