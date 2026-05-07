// ========================================
// File: src/app/s/[token]/route.ts
// ========================================

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

type SmsShortLink = {
  token?: unknown;
  url?: unknown;
};

function getShortLinksFromMetadata(metadata: unknown): SmsShortLink[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const links = (metadata as { smsShortLinks?: unknown }).smsShortLinks;
  if (!Array.isArray(links)) return [];

  return links.filter((link): link is SmsShortLink => {
    if (!link || typeof link !== "object" || Array.isArray(link)) return false;
    return typeof link.token === "string" && typeof link.url === "string";
  });
}

function isSafeRedirectUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export async function GET({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmedToken = token.trim();

  if (!trimmedToken) notFound();

  const dispatchId = trimmedToken.split("-")[0];

  if (!dispatchId) notFound();

  const dispatch = await prisma.notificationDispatch.findUnique({
    where: { id: dispatchId },
    select: {
      metadata: true,
    },
  });

  if (!dispatch) notFound();

  const link = getShortLinksFromMetadata(dispatch.metadata).find(
    (item) => item.token === trimmedToken,
  );

  if (!link || typeof link.url !== "string" || !isSafeRedirectUrl(link.url)) {
    notFound();
  }

  redirect(link.url);
}
