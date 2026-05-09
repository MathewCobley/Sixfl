// ========================================
// File: src/app/s/[token]/route.ts
// ========================================

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const SHORT_TOKEN_DISPATCH_PREFIX_LENGTH = 10;

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
  if (token.includes("-")) {
    const dispatchId = token.split("-")[0];

    if (!dispatchId) return null;

    return prisma.notificationDispatch.findUnique({
      where: { id: dispatchId },
      select: {
        metadata: true,
      },
    });
  }

  const dispatchIdPrefix = token.slice(0, SHORT_TOKEN_DISPATCH_PREFIX_LENGTH);

  if (dispatchIdPrefix.length < SHORT_TOKEN_DISPATCH_PREFIX_LENGTH) {
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
    take: 10,
  });

  return (
    candidates.find((candidate) =>
      getShortLinksFromMetadata(candidate.metadata).some(
        (link) => link.token === token,
      ),
    ) ?? null
  );
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
