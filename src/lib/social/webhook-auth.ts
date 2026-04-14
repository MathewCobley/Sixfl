// ========================================
// File: src/lib/social/webhook-auth.ts
// ========================================

import { NextRequest } from "next/server";

export function getSocialWebhookSecretFromEnv() {
  return process.env.SOCIAL_WEBHOOK_SECRET?.trim() ?? "";
}

export function getSocialWebhookSecretFromHeaders(
  headers: Headers | NextRequest["headers"],
) {
  return headers.get("x-sixfl-social-secret")?.trim() ?? "";
}

export function isValidSocialWebhookRequest(
  request: NextRequest | { headers: Headers },
) {
  const expected = getSocialWebhookSecretFromEnv();

  if (!expected) {
    return false;
  }

  const received = getSocialWebhookSecretFromHeaders(request.headers);
  return received === expected;
}

export function assertValidSocialWebhookRequest(
  request: NextRequest | { headers: Headers },
) {
  if (!isValidSocialWebhookRequest(request)) {
    throw new Error("Unauthorised social webhook request.");
  }
}