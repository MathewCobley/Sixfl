// ========================================
// File: src/lib/stripe/client.ts
// ========================================

import Stripe from "stripe";

let cachedStripeClient: Stripe | null = null;

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

export function getPublicSiteUrl() {
  const fallback = "https://www.sixfl.co.uk";

  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    fallback;

  return value.replace(/\/+$/, "");
}
