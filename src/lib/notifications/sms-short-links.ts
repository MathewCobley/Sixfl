// ========================================
// File: src/lib/notifications/sms-short-links.ts
// ========================================

import { getPublicSiteUrl } from "@/lib/stripe/client";

export type SmsShortLink = {
  token: string;
  url: string;
};

const SMS_URL_PATTERN = /https?:\/\/[^\s<>()"']+/gi;

export function trimTrailingUrlPunctuation(url: string) {
  return url.replace(/[.,;:!?]+$/g, "");
}

function getCompactShortLinkUrl(token: string) {
  const absoluteUrl = new URL(`/s/${token}`, `${getPublicSiteUrl()}/`).toString();

  return absoluteUrl
    .replace(/^https:\/\/www\./i, "")
    .replace(/^https:\/\//i, "");
}

function buildShortToken(input: { dispatchId: string; index: number }) {
  // Use the complete dispatch id so links created together can never share the
  // same short token. The redirect route already supports this exact-id format.
  return `${input.dispatchId}-${input.index.toString(36)}`;
}

export function shortenSmsBodyLinks(input: {
  dispatchId: string;
  bodyText: string;
  normaliseSmsText: (body: string) => string;
}) {
  const matches = Array.from(input.bodyText.matchAll(SMS_URL_PATTERN));

  if (matches.length === 0) {
    return {
      bodyText: input.normaliseSmsText(input.bodyText),
      links: [] as SmsShortLink[],
    };
  }

  const links: SmsShortLink[] = [];
  let bodyText = input.bodyText;

  matches.forEach((match, index) => {
    const original = match[0];
    const url = trimTrailingUrlPunctuation(original);
    const punctuation = original.slice(url.length);
    const token = buildShortToken({ dispatchId: input.dispatchId, index });
    const shortUrl = getCompactShortLinkUrl(token);

    links.push({ token, url });
    bodyText = bodyText.replace(original, `${shortUrl}${punctuation}`);
  });

  return {
    bodyText: input.normaliseSmsText(bodyText),
    links,
  };
}
