// ========================================
// File: src/lib/stripe/client.ts
// ========================================

import Stripe from "stripe";

let cachedStripeClient: Stripe | null = null;

const PRODUCTION_SITE_URL = "https://sixfl.co.uk";

export function getStripeServerClient(): Stripe {
  if (cachedStripeClient) {
    return cachedStripeClient;
  }

  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is missing.");
  }

  cachedStripeClient = new Stripe(apiKey);

  return cachedStripeClient;
}

export function getStripeWebhookSecret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!value) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing.");
  }

  return value;
}

function normalisePublicSiteUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);

    if (!url.protocol.startsWith("http")) return null;

    // SIXFL's authenticated app lives on the apex domain. Stripe Checkout and
    // Billing Portal must return to the same host or a host-scoped NextAuth
    // session can appear to disappear after the customer comes back from Stripe.
    if (url.hostname.toLowerCase() === "www.sixfl.co.uk") {
      url.hostname = "sixfl.co.uk";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isLocalSiteUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

export function getPublicSiteUrl() {
  const candidateUrls = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
  ];

  for (const candidateUrl of candidateUrls) {
    const url = normalisePublicSiteUrl(candidateUrl);

    if (!url) continue;

    if (process.env.NODE_ENV === "production" && isLocalSiteUrl(url)) {
      continue;
    }

    return url;
  }

  return PRODUCTION_SITE_URL;
}
