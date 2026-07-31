// ========================================
// File: src/app/api/kits/[id]/image/route.ts
// ========================================

import { getKitDesignImage } from "@/lib/kits/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const url = new URL(request.url);
  const variant = url.searchParams.get("size") === "full" ? "full" : "thumbnail";
  const image = await getKitDesignImage(id, variant);

  if (!image) {
    return new Response("Kit image not found.", { status: 404 });
  }

  const etag = `W/\"${id}-${variant}-${image.updatedAt.getTime()}\"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return new Response(Buffer.from(image.data), {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: etag,
    },
  });
}
