// ========================================
// File: src/app/s/[token]/route.ts
// ========================================

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const LEGACY_SHORT_TOKEN_DISPATCH_PREFIX_LENGTH = 10;

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

async function findDispatchForShortToken(token: string) {
  // New links contain the full notification dispatch id and are unambiguous.
  if (token.includes("-")) {
    const separatorIndex = token.lastIndexOf("-");
    const dispatchId = token.slice(0, separatorIndex);

    if (!dispatchId) return null;

    const dispatch = await prisma.notificationDispatch.findUnique({
      where: { id: dispatchId },
      select: { metadata: true },
    });

    if (!dispatch) return null;

    return getShortLinksFromMetadata(dispatch.metadata).some(
      (link) => link.token === token,
    )
      ? dispatch
      : null;
  }

  // Legacy links used only the first ten characters of a dispatch id. Several
  // dispatches created in one batch can share that prefix and therefore share
  // the same short token. Never guess which payment link was intended.
  const dispatchIdPrefix = token.slice(
    0,
    LEGACY_SHORT_TOKEN_DISPATCH_PREFIX_LENGTH,
  );

  if (dispatchIdPrefix.length < LEGACY_SHORT_TOKEN_DISPATCH_PREFIX_LENGTH) {
    return null;
  }

  const candidates = await prisma.notificationDispatch.findMany({
    where: {
      id: {
        startsWith: dispatchIdPrefix,
      },
    },
    select: {
      metadata: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const matchingCandidates = candidates.filter((candidate) =>
    getShortLinksFromMetadata(candidate.metadata).some(
      (link) => link.token === token,
    ),
  );

  return matchingCandidates.length === 1 ? matchingCandidates[0] : null;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ token: string }>;
  },
) {
  const { token } = await params;
  const trimmedToken = token.trim();

  if (!trimmedToken) notFound();

  const dispatch = await findDispatchForShortToken(trimmedToken);

  if (!dispatch) notFound();

  const link = getShortLinksFromMetadata(dispatch.metadata).find(
    (item) => item.token === trimmedToken,
  );

  if (!link || typeof link.url !== "string" || !isSafeRedirectUrl(link.url)) {
    notFound();
  }

  redirect(link.url);
}
